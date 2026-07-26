/**
 * POST /api/topup — pay-in: buy an ACU package.
 * Demo mode simulates instant settlement; production creates a Stripe/BitriPay
 * checkout session and settles on the verified webhook, posting the same ledger tx.
 */
import { TopupRequestSchema, TOPUP_PACKAGES, topupPostings } from "../shared/payments";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const parsed = TopupRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid top-up request", issues: parsed.error.issues.slice(0, 3) });

  const pkg = TOPUP_PACKAGES.find((p) => p.id === parsed.data.packageId)!;
  const live = !!process.env.STRIPE_SECRET_KEY || !!process.env.BITRIPAY_API_KEY;
  return res.status(200).json({
    mode: live ? "live_keys_present_but_flow_not_wired" : "demo",
    intent: {
      id: "pi_demo_" + pkg.id,
      status: "settled_demo",
      packageId: pkg.id,
      amountMinor: pkg.priceMinor,
      acuCredited: pkg.acu,
      method: parsed.data.method,
    },
    ledger: { kind: "acu_topup", postings: topupPostings(pkg.priceMinor) },
    note: "Production: create gateway checkout session → verified webhook → post this exact ledger tx, then credit ACUs (purchased category, 12-month validity).",
  });
}
