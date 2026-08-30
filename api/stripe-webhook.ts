/**
 * POST /api/stripe-webhook — the settlement authority.
 * Stripe calls this on payment events; the SIGNATURE IS THE ONLY TRUST:
 * we verify against STRIPE_WEBHOOK_SECRET on the RAW body, then act.
 * Setup (Stripe Dashboard → Developers → Webhooks → Add endpoint):
 *   URL:    https://<your-vercel-app>.vercel.app/api/stripe-webhook
 *   Events: checkout.session.completed, invoice.paid, invoice.payment_succeeded,
 *           invoice.payment_failed, customer.subscription.updated,
 *           customer.subscription.deleted, payment_intent.payment_failed,
 *           charge.refunded
 *   Then copy the signing secret into the STRIPE_WEBHOOK_SECRET env var.
 *
 * customer.subscription.updated is NOT optional. Whether a lapsed subscription
 * is ever deleted depends on the dunning setting in Billing → Subscriptions →
 * "Manage failed payments": only "cancel subscription" produces a deleted
 * event. On "mark unpaid" — a common default — the subscription lives on in
 * `unpaid` forever, and without the updated event the plan would never end.
 */
import Stripe from "stripe";
import { TOPUP_PACKAGES, topupPostings, PLANS, marketplaceSplit, salePostings, effectiveSellerPlan, EARNINGS_CLEARING_DAYS, grantCheck } from "../shared/payments";
import { REFERRAL_REWARD_ACU, GROWTH, verifiedNetRevenueMinor, commissionMinor } from "../shared/growth";
import { getDb, ensureSchema, ensureGameSchema, claimEvent, postTx, creditAcu, recordFounder, creditWallet, setWalletPlan, markWalletPurchased, unclaimEvent, claimAcuClawback, clawbackWallet, getListing, grantEntitlement, ensurePayoutSchema, creditEarnings, getWallet, revokeEntitlementByPaymentIntent, reverseEarnings, ensureReferralSchema, convertReferral, referrerForWallet, referralStats,
  ensureCommissionSchema, commissionEarnedFromCustomer, recordCommission, reverseCommissionForPaymentIntent } from "./_ledger";
import { notify } from "./_notify";

// Vercel: disable body parsing so the raw payload is available for verification
export const config = { api: { bodyParser: false } };

async function rawBody(req: any): Promise<Buffer> {
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * A referred account paid for the first time — credit the partner who brought
 * them. This is the moment the Growth Partner Programme becomes real: before
 * it, /api/referrals minted links and nothing ever paid out on one.
 *
 * convertReferral only ever returns a referrer ONCE per referred account, so a
 * customer's second and tenth purchase pay nobody again — the reward is for
 * bringing a paying customer, not for their spending. Best-effort by design:
 * a failure here must never fail the settlement that just credited a customer.
 */
async function payReferrer(sql: any, buyerWallet: string, eventId: string) {
  try {
    await ensureReferralSchema(sql);
    const conv = await convertReferral(sql, buyerWallet, REFERRAL_REWARD_ACU);
    if (!conv) return;
    await creditWallet(sql, conv.referrer_wallet, REFERRAL_REWARD_ACU);
    console.log(JSON.stringify({ referralPaid: { referrer: conv.referrer_wallet, code: conv.code, acu: REFERRAL_REWARD_ACU, eventId } }));
    await notify("referral.converted", null, { acu: String(REFERRAL_REWARD_ACU) });
  } catch (e) {
    console.error(JSON.stringify({ referralPayError: String((e as any)?.message ?? e), eventId }));
  }
}

/**
 * THE 1% LIFETIME COMMISSION. Runs on every settled payment by a referred
 * customer, not only the first — that is what "lifetime" means.
 *
 * Four rules from shared/growth.ts, all enforced here rather than described:
 *   unlock  — nothing accrues until the partner has GROWTH
 *             .commissionUnlockAfterPaidReferrals paid referrals
 *   net     — 1% of VERIFIED NET revenue, not of the price
 *   cap     — GROWTH.perCustomerLifetimeCapMinor per referred customer, ever
 *   clear   — held for the validation window before it is withdrawable, so a
 *             refund arriving three weeks later takes it back instead of
 *             having already been paid out
 *
 * Booked against the Stripe event id, which is UNIQUE on the table, so a
 * replayed webhook books one commission rather than two.
 */
async function accrueCommission(sql: any, buyerWallet: string, amountPaidMinor: number, eventId: string, paymentIntent: string | null) {
  try {
    if (!buyerWallet || !(amountPaidMinor > 0)) return;
    await ensureReferralSchema(sql);
    const referrer = await referrerForWallet(sql, buyerWallet);
    if (!referrer) return;

    const stats = await referralStats(sql, referrer);
    if (stats.converted < GROWTH.commissionUnlockAfterPaidReferrals) return;   // not unlocked yet

    await ensureCommissionSchema(sql);
    const already = await commissionEarnedFromCustomer(sql, referrer, buyerWallet);
    const net = verifiedNetRevenueMinor(amountPaidMinor, "card");
    const commission = commissionMinor(net, already);
    if (commission <= 0) return;                                               // capped out, or rounds to nothing

    const booked = await recordCommission(sql, {
      id: "rc_" + eventId.slice(-24),
      referrerWallet: referrer, referredWallet: buyerWallet, sourceEvent: eventId,
      grossMinor: amountPaidMinor, netMinor: net, commissionMinor: commission,
      validationDays: GROWTH.validationDays[0], paymentIntent,
    });
    if (booked) {
      console.log(JSON.stringify({ commissionAccrued: { referrer, customer: buyerWallet, grossMinor: amountPaidMinor, netMinor: net, commissionMinor: commission, eventId } }));
    }
  } catch (e) {
    console.error(JSON.stringify({ commissionError: String((e as any)?.message ?? e), eventId }));
  }
}

/** Shared event routing — also used by the Firebase function. */
export function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const kind = session.metadata?.kind;
      if (kind === "acu_topup") {
        const pkg = TOPUP_PACKAGES.find((p) => p.id === session.metadata?.packageId);
        if (!pkg) return { ok: false as const, note: `unknown package ${session.metadata?.packageId}` };
        // PRODUCTION: idempotency check on event.id → post ledger tx to Postgres
        // → credit `purchased` ACUs (12-month validity) to session.metadata.userId
        // → emit telemetry payout.first_payout when applicable.
        return {
          ok: true as const,
          action: "credit_acu",
          eventId: event.id,
          packageId: pkg.id,
          acu: pkg.acu,
          amountMinor: pkg.priceMinor,
          ledger: { kind: "acu_topup", postings: topupPostings(pkg.priceMinor) },
        };
      }
      if (kind === "marketplace_sale") {
        // price rode the session metadata from OUR server, never the buyer
        return {
          ok: true as const, action: "marketplace_sale", eventId: event.id,
          gameId: session.metadata?.gameId ?? "",
          priceMinor: Number(session.metadata?.priceMinor ?? 0),
          sellerWallet: session.metadata?.sellerWallet ?? "",
          buyerWalletId: session.metadata?.buyerWalletId ?? "",
        };
      }
      if (kind === "plan_subscription") {
        return { ok: true as const, action: "plan_activated", eventId: event.id, planId: session.metadata?.planId ?? "", walletId: session.metadata?.walletId ?? "" };
      }
      if (kind === "founder_pass" || session.metadata?.pass) {
        // PRODUCTION: record in Founders Registry, grant bonus ACUs at launch
        return { ok: true as const, action: "founder_pass", eventId: event.id, pass: session.metadata?.pass ?? "unknown" };
      }
      return { ok: true as const, action: "checkout_completed_untyped", eventId: event.id };
    }
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      // subscription RENEWALS: credit the month's ACUs (first invoice is handled
      // by checkout.session.completed — skip it here to avoid double-credit)
      const inv = event.data.object as any;
      const md = inv.subscription_details?.metadata || inv.parent?.subscription_details?.metadata || inv.lines?.data?.[0]?.metadata || {};
      if (md.kind === "plan_subscription" && inv.billing_reason !== "subscription_create") {
        // amount_paid rides along because the metadata planId is stamped when the
        // subscription is CREATED and never updated afterwards. If the price is
        // ever changed on a live subscription — a plan switch through Stripe's
        // customer portal, a manual edit in the dashboard — the metadata still
        // names the old plan, and the renewal would grant a Studio month's ACUs
        // for a Creator month's money. The invoice amount is the fact; the
        // metadata is only a label.
        return {
          ok: true as const, action: "plan_renewed", eventId: event.id,
          planId: md.planId ?? "", walletId: md.walletId ?? "",
          amountPaidMinor: typeof inv.amount_paid === "number" ? inv.amount_paid : null,
          // needed so a later refund can find the commission this renewal books
          paymentIntent: typeof inv.payment_intent === "string" ? inv.payment_intent : null,
        };
      }
      return { ok: true as const, action: "invoice_logged", eventId: event.id };
    }
    case "customer.subscription.deleted": {
      // subscription ended: entitlement is withdrawn (plan back to explorer)
      const sub = event.data.object as any;
      const md = sub.metadata || {};
      if (md.kind === "plan_subscription" && md.walletId) {
        return { ok: true as const, action: "plan_ended", eventId: event.id, walletId: md.walletId };
      }
      return { ok: true as const, action: "subscription_deleted_untyped", eventId: event.id };
    }
    case "customer.subscription.updated": {
      /**
       * A subscription does not only end by being deleted, and this is the gap
       * that let a plan outlive its payments.
       *
       * When a renewal fails Stripe moves the subscription to `past_due` and
       * starts dunning. Whether it is ever DELETED depends on a dashboard
       * setting: "cancel subscription" deletes it after the retries, but the
       * default in many accounts is "mark unpaid", which leaves it alive
       * forever. Handling only `deleted` therefore meant a subscriber who
       * stopped paying could keep their plan — and their commission rate —
       * indefinitely, with no event ever arriving to say otherwise.
       *
       * So the plan ends when the subscription stops being paid for, whichever
       * state Stripe expresses that in.
       */
      const sub = event.data.object as any;
      const md = sub.metadata || {};
      const DEAD = ["past_due", "unpaid", "canceled", "incomplete_expired", "paused"];
      if (md.kind === "plan_subscription" && md.walletId && DEAD.includes(String(sub.status))) {
        return { ok: true as const, action: "plan_ended", eventId: event.id, walletId: md.walletId, reason: String(sub.status) };
      }
      return { ok: true as const, action: "subscription_updated_logged", eventId: event.id, status: String(sub.status ?? "") };
    }
    case "invoice.payment_failed": {
      // The first signal that a renewal is in trouble. The plan is not withdrawn
      // here — Stripe retries, and cancelling on a single failed card would
      // punish a customer whose payment recovers a day later. The withdrawal
      // comes from customer.subscription.updated above once dunning gives up.
      const inv = event.data.object as any;
      const md = inv.subscription_details?.metadata || inv.parent?.subscription_details?.metadata || inv.lines?.data?.[0]?.metadata || {};
      return { ok: true as const, action: "invoice_payment_failed", eventId: event.id, walletId: md.walletId ?? "", planId: md.planId ?? "" };
    }
    case "payment_intent.payment_failed":
      return { ok: true as const, action: "payment_failed_logged", eventId: event.id };
    case "charge.refunded": {
      // reverse the ledger; ACU clawback is flagged to the operator (manual until
      // the charge→wallet mapping is stored end-to-end)
      const charge = event.data.object as any;
      return { ok: true as const, action: "refund_recorded", eventId: event.id, amountMinor: Number(charge.amount_refunded ?? 0) };
    }
    default:
      return { ok: true as const, action: "ignored", eventId: event.id, type: event.type };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "STRIPE_WEBHOOK_SECRET not configured" });

  let event: Stripe.Event;
  try {
    const body = await rawBody(req);
    const sig = req.headers["stripe-signature"];
    event = Stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  const result = handleStripeEvent(event);

  // Persist to the Postgres ledger when DATABASE_URL is configured
  const sql = getDb();
  let persisted: "yes" | "duplicate" | "no_db" | "error" = "no_db";
  if (sql) {
    try {
      await ensureSchema(sql);
      const fresh = await claimEvent(sql, event.id, event.type, { type: event.type });
      if (!fresh) {
        persisted = "duplicate"; // already settled — never double-credit
      } else {
        const session = (event.data?.object ?? {}) as Stripe.Checkout.Session;
        const email = (session as any)?.customer_details?.email ?? null;
        if (result.ok && (result as any).action === "credit_acu") {
          const r = result as { packageId: string; acu: number; amountMinor: number; ledger: { postings: Array<{ account: string; deltaMinor: number }> } };
          // Never credit AI for money that did not arrive — see grantCheck.
          const gc = grantCheck((session as any).amount_total, r.amountMinor);
          if (!gc.grant) {
            console.error(JSON.stringify({ topupNotGranted: { packageId: r.packageId, reason: gc.reason, session: session.id ?? "", eventId: event.id } }));
            await notify("executive.alert", process.env.CONTACT_INBOX || process.env.SMTP_USER || null, {
              item: `Top-up ${r.packageId} settled at £0 — ${gc.reason}. ${r.acu.toLocaleString()} ACUs were NOT credited (event ${event.id}). If this was a deliberate 100% promotion, credit the wallet from /admin.`,
            });
            persisted = "yes";
            console.log(JSON.stringify({ stripeWebhook: { ...result, persisted, granted: false } }));
            return res.status(200).json({ received: true, persisted, granted: false, reason: gc.reason });
          }
          if (gc.discounted) {
            console.warn(JSON.stringify({ topupDiscounted: { packageId: r.packageId, paidMinor: gc.paidMinor, listMinor: r.amountMinor, eventId: event.id } }));
          }
          await postTx(sql, "acu_topup", r.ledger.postings, { eventId: event.id, session: session.id ?? "", packageId: r.packageId });
          await creditAcu(sql, {
            stripeSession: session.id ?? event.id, email, packageId: r.packageId, acu: r.acu,
            paymentIntent: typeof (session as any).payment_intent === "string" ? (session as any).payment_intent : null,
            walletId: session.metadata?.walletId ?? null,
          });
          // Build 2: land the purchased ACUs on the buyer's server wallet (id rode Checkout metadata)
          const walletId = session.metadata?.walletId;
          if (walletId) {
            await ensureGameSchema(sql);
            await creditWallet(sql, walletId, r.acu);
            await markWalletPurchased(sql, walletId);   // paid wallets leave tester status forever
            await payReferrer(sql, walletId, event.id);
            await accrueCommission(sql, walletId, gc.paidMinor, event.id, typeof (session as any).payment_intent === "string" ? (session as any).payment_intent : null);
          }
          await notify("acu.topup.successful", email, { amount: r.acu.toLocaleString() });
        } else if (result.ok && (result as any).action === "marketplace_sale") {
          // Grant the purchase and post the split. The amount is re-derived from
          // the LISTING, so a tampered session cannot change what the seller earns.
          const r = result as any;
          await ensureGameSchema(sql);
          const listing = r.gameId ? await getListing(sql, r.gameId) : null;
          const priceMinor = Number(listing?.price_minor ?? r.priceMinor ?? 0);
          if (listing && priceMinor > 0) {
            // Commission is decided by the plan the seller holds AT SETTLEMENT.
            // The listing's stored seller_plan is only a fallback for a wallet
            // that cannot be read — never a rate a lapsed subscriber keeps.
            const sellerWallet = listing.creator_wallet ? await getWallet(sql, listing.creator_wallet) : null;
            const sellerPlan = effectiveSellerPlan(listing.seller_plan, sellerWallet ? ((sellerWallet as any).plan ?? "explorer") : null);
            const split = marketplaceSplit({ grossMinor: priceMinor, method: "card", sellerPlan, hasLineage: false });
            const entitlementId = (session.id ?? event.id) + ":" + listing.id;
            const paymentIntent = typeof (session as any).payment_intent === "string" ? (session as any).payment_intent : null;
            const granted = await grantEntitlement(sql, {
              id: entitlementId,
              gameId: listing.id,
              buyerWallet: r.buyerWalletId || null,
              buyerEmail: email,
              priceMinor,
              stripeSession: session.id ?? event.id,
              paymentIntent,   // the only handle a later refund will arrive with
            });
            if (granted) {
              await postTx(sql, "marketplace_sale", salePostings(split), { eventId: event.id, gameId: listing.id, session: session.id ?? "" });
              // The seller's share becomes earnings — only ever on a NEW
              // entitlement, so a replayed webhook cannot pay them twice — and it
              // lands in CLEARING, not in the withdrawable balance, so a
              // chargeback can still reach it. Self-purchases never pay out at
              // all: checkout refuses them, and this is the second gate in case
              // a session was created before that check existed.
              const selfBought = !!r.buyerWalletId && r.buyerWalletId === listing.creator_wallet;
              if (listing.creator_wallet && split.creatorMinor > 0 && !selfBought) {
                await ensurePayoutSchema(sql);
                await creditEarnings(sql, listing.creator_wallet, split.creatorMinor, {
                  holdId: entitlementId, clearingDays: EARNINGS_CLEARING_DAYS,
                });
              }
              if (selfBought) {
                console.warn(JSON.stringify({ selfPurchase: { gameId: listing.id, wallet: listing.creator_wallet, eventId: event.id } }));
              }
            }
          }
          await notify("marketplace.purchase", email, { title: listing?.title ?? "your world" });
        } else if (result.ok && (result as any).action === "plan_activated") {
          // subscription settled: set the wallet's plan + credit the month's ACUs
          const planId = (result as any).planId as string;
          const wid = (result as any).walletId as string;
          const plan = PLANS.find((p) => p.id === planId);
          if (plan && wid) {
            await ensureGameSchema(sql);
            // The PLAN is granted on the settled event — a discounted first month
            // is still a real subscription, and the commission tier is what they
            // bought. The ACUs are the part that costs us provider money, so they
            // follow the money: a £0 first invoice (free trial, 100% coupon)
            // activates the plan but grants no credit.
            await setWalletPlan(sql, wid, plan.id);
            await markWalletPurchased(sql, wid);
            // A subscription is a first payment too — the partner who brought
            // this customer is owed the same reward as on a top-up.
            await payReferrer(sql, wid, event.id);
            await accrueCommission(sql, wid, grantCheck((session as any).amount_total, plan.monthlyMinor).paidMinor, event.id, typeof (session as any).payment_intent === "string" ? (session as any).payment_intent : null);
            const gc = grantCheck((session as any).amount_total, plan.monthlyMinor);
            if (plan.monthlyAcu > 0 && gc.grant) {
              await creditWallet(sql, wid, plan.monthlyAcu);
            } else if (plan.monthlyAcu > 0) {
              console.error(JSON.stringify({ planAcuNotGranted: { planId: plan.id, walletId: wid, reason: gc.reason, eventId: event.id } }));
              await notify("executive.alert", process.env.CONTACT_INBOX || process.env.SMTP_USER || null, {
                item: `${plan.name} activated for ${wid} on a £0 invoice — ${gc.reason}. Plan is live; ${plan.monthlyAcu.toLocaleString()} ACUs were NOT granted (event ${event.id}).`,
              });
            }
          }
          await notify("subscription.activated", email, { plan: plan?.name ?? planId });
        } else if (result.ok && (result as any).action === "plan_renewed") {
          // Monthly renewal: credit the ACUs of the plan THE INVOICE PAID FOR.
          const labelled = PLANS.find((p) => p.id === (result as any).planId);
          const wid = (result as any).walletId as string;
          const paid = (result as any).amountPaidMinor as number | null;
          // If the amount does not match the labelled plan, believe the money and
          // find the plan it actually bought. An amount matching no plan at all
          // (a proration, a partial credit) grants nothing and is reported.
          const byAmount = typeof paid === "number" && paid > 0 ? PLANS.find((p) => p.monthlyMinor === paid) : null;
          const plan = byAmount ?? labelled;
          if (plan && wid && plan.monthlyAcu > 0) {
            await ensureGameSchema(sql);
            const gc = grantCheck(paid, plan.monthlyMinor);
            if (gc.grant) {
              await creditWallet(sql, wid, plan.monthlyAcu);
              // A plan switch made outside this codebase only becomes visible
              // here, so the wallet's tier is corrected on the renewal that
              // proves it — otherwise commission would keep using the old tier.
              // A renewal is lifetime revenue — "1% lifetime" means every month
              // they stay, not only the month they joined.
              await accrueCommission(sql, wid, paid ?? plan.monthlyMinor, event.id, (result as any).paymentIntent ?? null);
              if (byAmount && labelled && byAmount.id !== labelled.id) {
                await setWalletPlan(sql, wid, byAmount.id);
                console.warn(JSON.stringify({ planDrift: { walletId: wid, metadataSaid: labelled.id, invoicePaidFor: byAmount.id, eventId: event.id } }));
              }
            } else {
              console.error(JSON.stringify({ renewalAcuNotGranted: { walletId: wid, planId: plan.id, reason: gc.reason, eventId: event.id } }));
            }
          } else if (wid && typeof paid === "number" && paid > 0 && !byAmount && !labelled) {
            console.error(JSON.stringify({ renewalUnmatched: { walletId: wid, paidMinor: paid, eventId: event.id } }));
          }
          await notify("subscription.renewed", email, { plan: plan?.name ?? "" });
        } else if (result.ok && (result as any).action === "plan_ended") {
          // Back to explorer, which cannot sell — so the seller's commission
          // reverts to the top of the ladder at the next sale, and checkout
          // stops new sales of their listings until they resubscribe. The
          // listings keep their prices; nothing is deleted by a lapsed payment.
          const wid = (result as any).walletId as string;
          const why = (result as any).reason as string | undefined;
          await ensureGameSchema(sql);
          await setWalletPlan(sql, wid, "explorer");
          console.log(JSON.stringify({ planEnded: { walletId: wid, reason: why ?? "deleted", eventId: event.id } }));
          await notify("subscription.cancelled", email, {});
        } else if (result.ok && (result as any).action === "invoice_payment_failed") {
          // Logged, not acted on: Stripe is still retrying. Recorded so a plan
          // that later dies is traceable to the payment that started it.
          console.warn(JSON.stringify({ invoicePaymentFailed: { walletId: (result as any).walletId || null, planId: (result as any).planId || null, eventId: event.id } }));
        } else if (result.ok && (result as any).action === "refund_recorded") {
          // reverse the revenue in the ledger and flag the operator for ACU clawback
          const amt = Number((result as any).amountMinor ?? 0);
          if (amt > 0) {
            await postTx(sql, "refund_reversal", [
              { account: "gateway_clearing", deltaMinor: -amt },
              { account: "deferred_acu_revenue", deltaMinor: amt },
            ], { eventId: event.id });
          }
          // AUTOMATIC ACU CLAWBACK: a refunded customer must not keep spendable
          // AI credit, or the platform pays the provider bill for compute it was
          // never paid for. Single-use per credit, never drives a balance negative.
          const ch = (event.data?.object ?? {}) as any;
          const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : null;
          let clawed: { acu: number; removed: number; walletId: string } | null = null;
          try {
            await ensureGameSchema(sql);
            const credit = await claimAcuClawback(sql, { paymentIntent: pi, stripeSession: null });
            if (credit?.wallet_id) {
              const w = await clawbackWallet(sql, credit.wallet_id, Number(credit.acu));
              if (w) clawed = { acu: Number(credit.acu), removed: w.removed, walletId: credit.wallet_id };
            }
          } catch (e) { console.error(JSON.stringify({ clawbackError: String((e as any)?.message ?? e), eventId: event.id })); }

          /* A REFUNDED MARKETPLACE SALE has a second half the ACU clawback never
             touched: the buyer kept the game and the seller kept the money. So a
             refund was a way to buy a world for nothing, and — with a stolen card
             — a way to turn a chargeback into a withdrawal. Both sides reverse. */
          // Commission accrued on a payment that has now been refunded is not
          // earned. Reversing it is the reason it clears before it is paid.
          let commissionNote: string | null = null;
          try {
            await ensureCommissionSchema(sql);
            const rev = pi ? await reverseCommissionForPaymentIntent(sql, pi) : null;
            if (rev) {
              commissionNote = `referral commission £${(Number(rev.commission_minor) / 100).toFixed(2)} reversed for ${rev.referrer_wallet}`
                + (rev.released_at ? " (ALREADY RELEASED — recover from future earnings)" : " before it cleared");
            }
          } catch (e) { console.error(JSON.stringify({ commissionReverseError: String((e as any)?.message ?? e), eventId: event.id })); }

          let sale: string | null = null;
          if (pi) {
            try {
              const revoked = await revokeEntitlementByPaymentIntent(sql, pi);
              if (revoked) {
                await ensurePayoutSchema(sql);
                const rev = await reverseEarnings(sql, revoked.id);
                sale = rev
                  ? `sale of ${revoked.game_id} reversed — £${(rev.amountMinor / 100).toFixed(2)} recovered from ${rev.walletId}` +
                    (rev.shortfallMinor > 0 ? `, £${(rev.shortfallMinor / 100).toFixed(2)} SHORTFALL (already withdrawn — debt to chase)` : " in full, before it cleared")
                  : `entitlement for ${revoked.game_id} revoked; no earnings hold found to reverse`;
              }
            } catch (e) { console.error(JSON.stringify({ saleReversalError: String((e as any)?.message ?? e), eventId: event.id })); }
          }

          await notify("executive.alert", process.env.CONTACT_INBOX || process.env.SMTP_USER || null, {
            item: `Stripe refund £${(amt / 100).toFixed(2)} — ` + [
              clawed
                ? `${clawed.removed} of ${clawed.acu} ACUs clawed back from ${clawed.walletId}${clawed.removed < clawed.acu ? " (rest already spent — shortfall to write off)" : ""}`
                : sale ? null : "no matching ACU credit found; review manually",
              sale,
              commissionNote,
            ].filter(Boolean).join("; ") + ` (event ${event.id})`,
          });
        } else if (result.ok && (result as any).action === "founder_pass") {
          await recordFounder(sql, { stripeSession: session.id ?? event.id, pass: (result as any).pass, email, amountMinor: (session.amount_total as number) ?? null });
        }
        persisted = "yes";
      }
    } catch (err: any) {
      persisted = "error";
      console.error(JSON.stringify({ ledgerError: String(err?.message ?? err), eventId: event.id }));
      // release the idempotency claim and fail LOUDLY so Stripe retries —
      // a charged customer must never silently lose their credits
      try { await unclaimEvent(sql, event.id); } catch { /* claim row may not exist */ }
      return res.status(500).json({ received: false, persisted, error: "settlement failed — will retry" });
    }
  }

  console.log(JSON.stringify({ stripeWebhook: { ...result, persisted } }));
  return res.status(200).json({ received: true, persisted, ...result });
}
