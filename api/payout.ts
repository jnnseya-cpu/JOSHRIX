/**
 * POST /api/payout — pay-out: creator withdrawal request.
 * Validates minimum, computes rail fee, returns the balanced ledger tx.
 * Production: KYC state check → Stripe Connect / BitriPay payout API → status
 * webhooks advance processing → settled.
 */
import { PayoutRequestSchema, PAYOUT, payoutFeeMinor, payoutPostings } from "../shared/payments";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const parsed = PayoutRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payout request", issues: parsed.error.issues.slice(0, 3) });

  const { amountMinor, rail, instant, destinationRef } = parsed.data;
  if (amountMinor < PAYOUT.minMinor) {
    return res.status(400).json({ error: `Minimum payout is £${(PAYOUT.minMinor / 100).toFixed(2)}` });
  }
  if (instant && rail !== "bank_transfer") {
    return res.status(400).json({ error: "Instant payout is available on bank_transfer only" });
  }
  const feeMinor = payoutFeeMinor(rail, amountMinor, instant);
  const netMinor = amountMinor - feeMinor;
  const railCfg = PAYOUT.rails[rail];
  const etaDays = instant ? 0 : railCfg.etaDays;
  return res.status(200).json({
    mode: "demo",
    payout: {
      id: "po_demo_" + rail,
      status: "processing_demo",
      rail, instant: !!instant,
      amountMinor, feeMinor, netMinor, etaDays,
      destinationRef: destinationRef.slice(0, 8) + "…", // never echo full destinations
      kycRequired: amountMinor >= PAYOUT.kycThresholdMinor,
    },
    ledger: { kind: "payout", postings: payoutPostings(amountMinor, feeMinor) },
  });
}
