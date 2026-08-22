/**
 * POST /api/topup — pay-in: buy an ACU package.
 * With STRIPE_SECRET_KEY set this creates a REAL Stripe Checkout Session
 * (settlement happens only on the verified webhook — /api/stripe-webhook).
 * Without keys it returns the demo settlement so the flow works pre-launch.
 */
import Stripe from "stripe";
import { TopupRequestSchema, TOPUP_PACKAGES, topupPostings } from "../shared/payments";
import { safeOrigin, clientIp, rateLimit, tooMany } from "./_guard";
import { getDb } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const _sql = getDb();
  if (_sql) {
    const _rl = await rateLimit(_sql, "topup:" + clientIp(req), 10, 3600);
    if (!_rl.ok) return tooMany(res, _rl.retryAfter, "payment attempts");
  }

  const parsed = TopupRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid top-up request", issues: parsed.error.issues.slice(0, 3) });
  const pkg = TOPUP_PACKAGES.find((p) => p.id === parsed.data.packageId)!;

  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const origin = safeOrigin(req);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: pkg.priceMinor,
            product_data: { name: `JOSHRIX ACU top-up — ${pkg.acu.toLocaleString()} ACUs` },
          },
        }],
        metadata: { kind: "acu_topup", packageId: pkg.id, ...(parsed.data.walletId ? { walletId: parsed.data.walletId } : {}) },
        success_url: `${origin}/wallet.html?topup=success`,
        cancel_url: `${origin}/wallet.html?topup=cancelled`,
      });
      return res.status(200).json({
        mode: "live",
        checkoutUrl: session.url,
        intent: { id: session.id, status: "requires_payment", packageId: pkg.id, amountMinor: pkg.priceMinor, acuOnSettlement: pkg.acu },
        note: "ACUs credit ONLY when the verified webhook receives checkout.session.completed.",
      });
    } catch (err: any) {
      return res.status(502).json({ error: "Stripe session creation failed", detail: String(err?.message ?? err) });
    }
  }

  return res.status(200).json({
    mode: "demo",
    intent: { id: "pi_demo_" + pkg.id, status: "settled_demo", packageId: pkg.id, amountMinor: pkg.priceMinor, acuCredited: pkg.acu, method: parsed.data.method },
    ledger: { kind: "acu_topup", postings: topupPostings(pkg.priceMinor) },
  });
}
