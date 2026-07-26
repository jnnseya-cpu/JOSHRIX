/**
 * JOSHRIX Studio backend — Firebase Cloud Functions (2nd gen).
 * One HTTPS function `api` routes:
 *   GET  /health     (also /api/health)     — readiness + provider booleans
 *   POST /blueprint  (also /api/blueprint)  — Idea Agent (Claude primary, demo fallback)
 * Secret: firebase functions:secrets:set ANTHROPIC_API_KEY   (fresh key only — never a previously pasted one)
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { generateBlueprint, providerStatus, BLUEPRINT_ACU_CHARGE } from "./gateway";
import { TelemetryBatchSchema } from "./shared/telemetry";
import {
  TopupRequestSchema, CheckoutRequestSchema, PayoutRequestSchema,
  TOPUP_PACKAGES, PAYOUT, marketplaceSplit, salePostings, topupPostings,
  payoutFeeMinor, payoutPostings,
} from "./shared/payments";
import { REFERRAL, INFLUENCER_TIERS, CreateReferralCodeSchema, referralEarningsMinor } from "./shared/referrals";

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

export const api = onRequest(
  {
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 60,
    memory: "512MiB",
    secrets: [ANTHROPIC_API_KEY],
  },
  async (req, res) => {
    const path = req.path.replace(/^\/api(?=\/|$)/, "") || "/";

    if (path === "/health") {
      res.status(200).json({
        ok: true,
        service: "joshrix-studio",
        layers: { backend: "firebase functions (europe-west2)", shared: "shared/contracts.ts (bundled)", frontend: "vercel static" },
        providers: providerStatus(),
        mode: process.env.ANTHROPIC_API_KEY ? "live" : "demo (set the ANTHROPIC_API_KEY secret to go live)",
      });
      return;
    }

    if (path === "/blueprint") {
      if (req.method !== "POST") {
        res.status(405).json({ error: "POST only" });
        return;
      }
      const { prompt, type, platform, scope, language } = (req.body ?? {}) as Record<string, string>;
      if (!prompt || typeof prompt !== "string" || prompt.length < 4) {
        res.status(400).json({ error: "Body must include a game description in `prompt`." });
        return;
      }
      if (prompt.length > 4000) {
        res.status(400).json({ error: "Prompt too long (max 4000 chars)." });
        return;
      }
      try {
        const { blueprint, provider } = await generateBlueprint(prompt, { type, platform, scope, language });
        res.status(200).json({ blueprint, provider, acuCharge: BLUEPRINT_ACU_CHARGE });
      } catch (err: unknown) {
        res.status(502).json({ error: "Blueprint generation failed", detail: String((err as Error)?.message ?? err) });
      }
      return;
    }

    if (path === "/telemetry") {
      if (req.method !== "POST") {
        res.status(405).json({ error: "POST only" });
        return;
      }
      const parsed = TelemetryBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid telemetry batch", issues: parsed.error.issues.slice(0, 5) });
        return;
      }
      // Demo mode: validate + acknowledge. Production: enqueue to the Forge Graph store.
      res.status(200).json({ accepted: parsed.data.events.length, mode: "demo" });
      return;
    }

    if (path === "/wallet" && req.method === "GET") {
      const sale = marketplaceSplit({ grossMinor: 499, method: "card", sellerPlan: "creator_pro", hasLineage: false });
      const remixSale = marketplaceSplit({ grossMinor: 499, method: "card", sellerPlan: "creator_pro", hasLineage: true });
      res.status(200).json({
        mode: "demo", currency: "GBP",
        acu: { total: 1873, byCategory: { promotional: 40, subscription: 833, purchased: 1000, referral: 0 },
          consumptionOrder: ["promotional", "subscription", "purchased", "contract"] },
        earnings: { availableMinor: 48_200, pendingMinor: 12_350, lifetimeMinor: 96_400 },
        payout: { minMinor: PAYOUT.minMinor, scheduleDays: PAYOUT.scheduleDays, kycThresholdMinor: PAYOUT.kycThresholdMinor },
        recentLedger: [
          { kind: "acu_topup", label: "£25 top-up → 2,500 ACUs", postings: topupPostings(2_500) },
          { kind: "marketplace_sale", label: "Penalty King sold £4.99 (Creator Pro 20%)", postings: salePostings(sale), split: sale },
          { kind: "marketplace_sale", label: "Remix sold £4.99 (with 30% lineage)", postings: salePostings(remixSale), split: remixSale },
        ],
      });
      return;
    }

    if (path === "/payments/topup" && req.method === "POST") {
      const parsed = TopupRequestSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: "Invalid top-up request", issues: parsed.error.issues.slice(0, 3) }); return; }
      const pkg = TOPUP_PACKAGES.find((p) => p.id === parsed.data.packageId)!;
      res.status(200).json({
        mode: "demo",
        intent: { id: "pi_demo_" + pkg.id, status: "settled_demo", packageId: pkg.id, amountMinor: pkg.priceMinor, acuCredited: pkg.acu, method: parsed.data.method },
        ledger: { kind: "acu_topup", postings: topupPostings(pkg.priceMinor) },
      });
      return;
    }

    if (path === "/payments/checkout" && req.method === "POST") {
      const parsed = CheckoutRequestSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: "Invalid checkout request", issues: parsed.error.issues.slice(0, 3) }); return; }
      try {
        const split = marketplaceSplit({ grossMinor: parsed.data.priceMinor, method: parsed.data.method, sellerPlan: parsed.data.sellerPlan, hasLineage: parsed.data.hasLineage });
        res.status(200).json({ mode: "demo", listingId: parsed.data.listingId, split, ledger: { kind: "marketplace_sale", postings: salePostings(split) } });
      } catch (err: unknown) {
        res.status(400).json({ error: String((err as Error)?.message ?? err) });
      }
      return;
    }

    if (path === "/payouts" && req.method === "POST") {
      const parsed = PayoutRequestSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: "Invalid payout request", issues: parsed.error.issues.slice(0, 3) }); return; }
      const { amountMinor, rail, instant, destinationRef } = parsed.data;
      if (amountMinor < PAYOUT.minMinor) { res.status(400).json({ error: `Minimum payout is £${(PAYOUT.minMinor / 100).toFixed(2)}` }); return; }
      if (instant && rail !== "bank_transfer") { res.status(400).json({ error: "Instant payout is available on bank_transfer only" }); return; }
      const feeMinor = payoutFeeMinor(rail, amountMinor, instant);
      res.status(200).json({
        mode: "demo",
        payout: { id: "po_demo_" + rail, status: "processing_demo", rail, instant: !!instant, amountMinor, feeMinor,
          netMinor: amountMinor - feeMinor, etaDays: instant ? 0 : PAYOUT.rails[rail].etaDays,
          destinationRef: destinationRef.slice(0, 8) + "…", kycRequired: amountMinor >= PAYOUT.kycThresholdMinor },
        ledger: { kind: "payout", postings: payoutPostings(amountMinor, feeMinor) },
      });
      return;
    }

    if (path === "/referrals") {
      if (req.method === "POST") {
        const parsed = CreateReferralCodeSchema.safeParse(req.body);
        if (!parsed.success) { res.status(400).json({ error: "Invalid handle", issues: parsed.error.issues.slice(0, 3) }); return; }
        res.status(200).json({ mode: "demo", code: "JX-" + parsed.data.handle.toUpperCase(),
          link: "https://joshrix.com/?ref=JX-" + parsed.data.handle.toUpperCase(), rules: REFERRAL });
        return;
      }
      const sample = referralEarningsMinor(
        [{ planId: "creator", monthsPaid: 12 }, { planId: "creator_pro", monthsPaid: 9 },
         { planId: "creator_pro", monthsPaid: 12 }, { planId: "studio", monthsPaid: 6 }], 31);
      res.status(200).json({
        mode: "demo",
        programme: { ...REFERRAL, tiers: INFLUENCER_TIERS },
        dashboard: { code: "JX-JUSTIN", link: "https://joshrix.com/?ref=JX-JUSTIN", clicks: 1240, signups: 86,
          activated: 31, tier: sample.tierId, earnedMinor: sample.earnedMinor, onHoldMinor: 2_450 },
      });
      return;
    }

    res.status(404).json({
      error: "Not found",
      routes: ["GET /health", "POST /blueprint", "POST /telemetry", "GET /wallet", "POST /payments/topup", "POST /payments/checkout", "POST /payouts", "GET|POST /referrals"],
    });
  },
);
