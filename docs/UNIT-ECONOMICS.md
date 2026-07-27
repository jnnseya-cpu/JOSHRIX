# JOSHRIX Unit Economics — The Fully-Loaded Margin Model

> The 4× AI-provider rule ([MONETISATION.md](MONETISATION.md)) protects against AI cost — but the real P&L also pays Stripe, Google Cloud/Firebase, Vercel, VAT, refunds and fixed overheads. This document + [`shared/economics.ts`](../shared/economics.ts) make **every** cost line explicit so no SKU can quietly lose money. Rates are indicative (July 2026) and admin-tunable.

## 1. The Complete Cost Stack

| Layer | What it costs (indicative) | Where it bites |
|---|---|---|
| **AI providers** | per MONETISATION action table (largest variable cost) | every forge/refine/asset action |
| **Stripe** | UK 1.5% + 20p · EEA 2.5% + 20p · intl 3.25% + 20p · £20/chargeback · Connect payouts 0.25% + 10p + ~£2/mo per active creator | every pay-in and every payout |
| **Google Cloud / Firebase** | Functions ~£0.002/vCPU-s · Firestore ~0.005p/read, 0.015p/write · storage ~2p/GB-mo · **egress ~9.6p/GB** | forge compute, data, game serving |
| **Vercel** | Pro £16/mo + ~12p/GB bandwidth over quota | frontend serving |
| **VAT** | 20% of consumer price once registered (threshold £90k) — prices are VAT-inclusive, so net revenue = price ÷ 1.2 | every consumer sale |
| **Refunds/disputes allowance** | 1.5% of consumer revenue provisioned | everything |
| **App stores** | 15–30% *only* on store-processed purchases | why PWA-first matters |
| **Fixed overhead (founder phase)** | ~**£75/month** (Vercel £16, Neon £15, email £15, domain, Apple dev amortised, misc) | the monthly nut |

**Two structural insights the model proves:**
1. **Infra is noise; AI is the cost.** A full forge cycle's Google Cloud cost is ~**1p**; a play session ~**0.06p**. The ACU 4× rule really is guarding the right line — everything else is percentage skims.
2. **The wallet model is the margin machine.** Stripe's 20p fixed fee is paid **once per top-up**, then hundreds of ACU actions spend from the wallet with zero payment cost. Never charge cards per action; never price a consumer charge below **£1.99** (the fixed fee makes small charges toxic).

## 2. The Rules (now two floors, both enforced in code)

- **Rule A (existing):** retail ≥ **4× attributable AI provider cost**.
- **Rule B (new):** retail must keep **fully-loaded contribution ≥ 60% of ex-VAT revenue** after VAT, processing, refund allowance, AI and infra — `priceFloorMinor()` computes the price that satisfies **both**, with the £1.99 minimum-charge floor.
- **Margin alerts** (`marginAlert()`): warn < 60% · act < 50% (re-route providers, reprice) · panic < 40% (suspend the SKU).
- **Payout costs** are recovered by rail fees (PAYMENTS.md) — payouts must never be margin-negative.

## 3. Worked Examples (from the tested model)

| SKU | Gross | VAT | Stripe | Refund prov. | AI | Infra | **Contribution** | **Margin (ex-VAT)** |
|---|---|---|---|---|---|---|---|---|
| £25 ACU top-up (provider £5 = 25% cap) | £25.00 | £4.17 | £0.58 | £0.38 | £5.00 | £0.01 | **£14.86** | **71.3%** ✅ |
| £49 Creator Pro month (provider ≤ £2.45) | £49.00 | £8.17 | £0.94 | £0.74 | £2.45 | £0.60 | **£36.10** | **88.4%** ✅ |
| £1.00 commission on £4.99 sale | £1.00 | £0.17 | (paid in buyer flow) | £0.02 | — | £0.01 | **£0.58** | **69.9%** ✅ |

Price-floor outputs: level pack with £1.50 provider cost → **£6.00** (Rule A binds) · tiny 10p action → **£1.99** (min-charge binds) · heavy 3D forge at £6 provider → **£24.00**.

## 4. Break-Even & the 100%-Profit Path

- Fixed overhead ≈ **£75/month** → covered by **3 Founder Pro passes** or ~2 Creator Pro subscriptions. Everything after that is contribution.
- Founder-phase P&L is intentionally variable-cost dominated: no salaries, no offices, serverless scale-to-zero. **The platform is profitable from single-digit customers**, and margin *improves* with scale (provider volume discounts, egress via R2 later, Stripe volume pricing).
- The margin engine's job in production: attribute provider + infra cost per action into the Forge Graph, compute fully-loaded margin per SKU **daily**, and fire the warn/act/panic alerts to the admin Economy module — pricing is a control loop, not a spreadsheet.

## 5. VAT Notes (UK)

Below the £90k threshold you may charge without VAT (keep prices unchanged — it's pure margin headroom, ~+20%). Register at threshold; use Stripe Tax to automate; all consumer prices remain **VAT-inclusive** so nothing on the site changes at registration — margins simply move from the "pre-VAT" to the modelled columns above, which is exactly what the model already assumes (conservative by design).
