/**
 * POST /api/payout — creator withdrawal request.
 * Body: { walletId, amountMinor, rail, instant?, destinationId }
 *
 * What this DOES do: verify the creator actually has the earnings, reserve them
 * atomically (so the same money cannot be withdrawn twice by concurrent
 * requests), compute the rail fee, and queue an operator-reviewable request.
 *
 * What this does NOT do: move money. Executing a payout needs a Stripe Connect
 * (or BitriPay) account with completed KYC on the recipient — configuration
 * only the platform owner can perform. Requests therefore land in the queue at
 * status "requested" and an operator releases them from /api/admin-payouts.
 * The response says so plainly rather than implying money is on its way.
 */
import { randomUUID } from "node:crypto";
import { PayoutRequestSchema, PAYOUT, payoutFeeMinor, payoutPostings } from "../shared/payments";
import { getDb, ensurePayoutSchema, ensureGameSchema, getEarnings, reserveForPayout, savePayoutRequest, walletOwnerUid,
  ensurePayoutDestinationSchema, getPayoutDestination, ensureCommissionSchema, releaseClearedCommission } from "./_ledger";
import { callerIdentity } from "./_auth";
import { clientIp, recordSecurityEvent } from "./_guard";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const parsed = PayoutRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payout request", issues: parsed.error.issues.slice(0, 3) });

  const { amountMinor, rail, instant, destinationId } = parsed.data;
  const walletId = typeof req.body?.walletId === "string" ? req.body.walletId : "";
  if (!walletId) return res.status(400).json({ error: "walletId required — payouts are tied to the earning account." });
  if (amountMinor < PAYOUT.minMinor) {
    return res.status(400).json({ error: `Minimum payout is £${(PAYOUT.minMinor / 100).toFixed(2)}` });
  }
  if (instant && rail !== "bank_transfer") {
    return res.status(400).json({ error: "Instant payout is available on bank_transfer only" });
  }

  const feeMinor = payoutFeeMinor(rail, amountMinor, instant);
  const netMinor = amountMinor - feeMinor;
  if (netMinor <= 0) {
    return res.status(400).json({ error: "The rail fee would consume the whole withdrawal — request a larger amount." });
  }
  const kycRequired = amountMinor >= PAYOUT.kycThresholdMinor;

  const sql = getDb();
  if (!sql) {
    return res.status(503).json({ error: "Payouts are unavailable — no ledger configured.", queued: false });
  }

  try {
    await ensurePayoutSchema(sql);
    await ensureGameSchema(sql);

    /* MONEY OUT IS THE ONE PLACE WITH NO GRACE PERIOD.
       This endpoint takes the wallet to debit AND the destination to pay, both
       from the request body. Before identity was verified, anyone who obtained
       a walletId — and /api/wallet-init would hand one over for an email
       address — could send a creator's earnings to their own account. So a
       withdrawal requires a Firebase token proving the caller owns the wallet.

       A wallet with no firebase_uid has never been signed into since identity
       shipped. It cannot prove ownership, so it cannot withdraw: the creator
       signs in once, the wallet binds, and the payout goes through. That is a
       far better failure than paying the wrong person. */
    const caller = await callerIdentity(req);
    const ownerUid = await walletOwnerUid(sql, walletId);
    if (!caller) {
      return res.status(401).json({ error: "Sign in to withdraw your earnings.", code: "auth_required", queued: false });
    }
    if (!ownerUid) {
      return res.status(401).json({
        error: "Sign in once on this account before withdrawing — this wallet has not been linked to your sign-in yet. Open the Studio while signed in, then request the payout again.",
        code: "wallet_unlinked", queued: false,
      });
    }
    if (ownerUid !== caller.uid) {
      await recordSecurityEvent(sql, "payout_wallet_mismatch", "block", {
        ip: clientIp(req), walletId, callerUid: caller.uid,
      });
      return res.status(403).json({ error: "That wallet does not belong to this account.", code: "not_your_wallet", queued: false });
    }

    /* WHERE THE MONEY GOES. This used to be a `destinationRef` string taken
       straight from the request body, and the wallet page sent the hard-coded
       literal "tok_demo_dest_2941" — so every payout request in the system
       carried the same fake and none of them could ever have paid anyone.
       A withdrawal now names one of the caller's own saved destinations, and
       getPayoutDestination scopes the lookup to their wallet, so a guessed id
       reaches nothing. */
    await ensurePayoutDestinationSchema(sql);
    const destId = destinationId;
    const dest = await getPayoutDestination(sql, destId, walletId);
    if (!dest) {
      return res.status(404).json({ error: "No such payout destination on this account.", code: "unknown_destination", queued: false });
    }
    if (dest.rail !== rail) {
      return res.status(400).json({
        error: `That destination is set up for ${dest.rail.replace(/_/g, " ")}, not ${rail.replace(/_/g, " ")}.`,
        code: "rail_mismatch", queued: false,
      });
    }

    /* Accrued referral commission that has finished its validation window
       becomes withdrawable at the same moment as anything else — otherwise a
       partner would see a balance they could not request. */
    try { await ensureCommissionSchema(sql); await releaseClearedCommission(sql, walletId); } catch { /* sweep must not block a payout */ }

    const bal = await getEarnings(sql, walletId);
    const available = Number(bal.available_minor ?? 0);
    if (available < amountMinor) {
      return res.status(402).json({
        error: `Insufficient earnings — £${(available / 100).toFixed(2)} available, £${(amountMinor / 100).toFixed(2)} requested.`,
        availableMinor: available, queued: false,
      });
    }
    // ATOMIC: two concurrent requests cannot both reserve the same earnings.
    const reserved = await reserveForPayout(sql, walletId, amountMinor);
    if (!reserved) {
      return res.status(409).json({ error: "Earnings changed while the request was being processed — try again.", queued: false });
    }

    const id = "po_" + randomUUID().replace(/-/g, "").slice(0, 18);
    await savePayoutRequest(sql, { id, walletId, amountMinor, feeMinor, netMinor, rail, destinationRef: dest.id, kycRequired });

    return res.status(202).json({
      queued: true,
      payout: {
        id, status: "requested", rail, instant: !!instant,
        amountMinor, feeMinor, netMinor,
        etaDays: instant ? 0 : PAYOUT.rails[rail].etaDays,
        // The saved destination, by its label and last four — the reference
        // itself is encrypted and is never returned to anybody, owner included.
        destination: { id: dest.id, label: dest.label, endsWith: dest.last4, rail: dest.rail },
        kycRequired,
      },
      ledger: { kind: "payout", postings: payoutPostings(amountMinor, feeMinor) },
      note: kycRequired
        ? "Reserved and queued. Identity verification is required at this amount before release."
        : "Reserved and queued for operator release. Funds move once the payout rail is executed.",
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Payout request failed", detail: String(err?.message ?? err).slice(0, 200), queued: false });
  }
}
