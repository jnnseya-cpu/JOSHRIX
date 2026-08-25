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
import { TOPUP_PACKAGES, topupPostings, PLANS, marketplaceSplit, salePostings, effectiveSellerPlan, EARNINGS_CLEARING_DAYS } from "../shared/payments";
import { getDb, ensureSchema, ensureGameSchema, claimEvent, postTx, creditAcu, recordFounder, creditWallet, setWalletPlan, markWalletPurchased, unclaimEvent, claimAcuClawback, clawbackWallet, getListing, grantEntitlement, ensurePayoutSchema, creditEarnings, getWallet, revokeEntitlementByPaymentIntent, reverseEarnings } from "./_ledger";
import { notify } from "./_notify";

// Vercel: disable body parsing so the raw payload is available for verification
export const config = { api: { bodyParser: false } };

async function rawBody(req: any): Promise<Buffer> {
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
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
        return { ok: true as const, action: "plan_renewed", eventId: event.id, planId: md.planId ?? "", walletId: md.walletId ?? "" };
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
          const r = result as { packageId: string; acu: number; ledger: { postings: Array<{ account: string; deltaMinor: number }> } };
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
            await setWalletPlan(sql, wid, plan.id);
            if (plan.monthlyAcu > 0) await creditWallet(sql, wid, plan.monthlyAcu);
            await markWalletPurchased(sql, wid);
          }
          await notify("subscription.activated", email, { plan: plan?.name ?? planId });
        } else if (result.ok && (result as any).action === "plan_renewed") {
          // monthly renewal: credit the plan's ACUs to the subscriber's wallet
          const plan = PLANS.find((p) => p.id === (result as any).planId);
          const wid = (result as any).walletId as string;
          if (plan && wid && plan.monthlyAcu > 0) {
            await ensureGameSchema(sql);
            await creditWallet(sql, wid, plan.monthlyAcu);
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
