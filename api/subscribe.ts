/**
 * POST /api/subscribe — user-side plan selection.
 * Body: { planId, walletId? }
 * With STRIPE_SECRET_KEY: creates a REAL Stripe subscription Checkout Session
 * (monthly, inline price). The plan activates ONLY when the verified webhook
 * receives checkout.session.completed — that settlement sets the wallet's plan
 * and credits the first month's ACUs. Demo mode returns the would-be terms.
 */
import Stripe from "stripe";
import { PLANS } from "../shared/payments";
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
    const _rl = await rateLimit(_sql, "subscribe:" + clientIp(req), 5, 3600);
    if (!_rl.ok) return tooMany(res, _rl.retryAfter, "sign-ups");
  }

  const { planId, walletId } = (req.body ?? {}) as { planId?: string; walletId?: string };
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return res.status(400).json({ error: `planId must be one of: ${PLANS.map((p) => p.id).join(", ")}` });
  if (plan.monthlyMinor === 0) return res.status(400).json({ error: "Explorer is free — nothing to subscribe to. Play and browse away." });

  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const origin = safeOrigin(req);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: plan.monthlyMinor,
            recurring: { interval: "month" },
            product_data: { name: `JOSHRIX ${plan.name} — ${plan.monthlyAcu.toLocaleString()} ACUs/month` },
          },
        }],
        metadata: { kind: "plan_subscription", planId: plan.id, ...(walletId ? { walletId } : {}) },
        subscription_data: { metadata: { kind: "plan_subscription", planId: plan.id, ...(walletId ? { walletId } : {}) } },
        success_url: `${origin}/wallet.html?plan=activated`,
        cancel_url: `${origin}/pricing.html?plan=cancelled`,
      });
      return res.status(200).json({ mode: "live", checkoutUrl: session.url, planId: plan.id, note: "Plan activates when the verified webhook confirms payment." });
    } catch (err: any) {
      return res.status(502).json({ error: "Stripe session creation failed", detail: String(err?.message ?? err) });
    }
  }

  return res.status(200).json({ mode: "demo", planId: plan.id, monthlyMinor: plan.monthlyMinor, monthlyAcu: plan.monthlyAcu, note: "Demo — with STRIPE_SECRET_KEY this opens live subscription checkout." });
}
