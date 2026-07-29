# JOSHRIX Payment Structure — Pay-In & Pay-Out (Implemented)

The money layer as built. Contracts and split mathematics live in [`shared/payments.ts`](../shared/payments.ts) and [`shared/referrals.ts`](../shared/referrals.ts); endpoints run on both backends (Firebase function routes + the Vercel `api/` mirror); the UI is [`frontend/wallet.html`](../frontend/wallet.html) and [`frontend/referrals.html`](../frontend/referrals.html). Economics follow [MONETISATION.md](MONETISATION.md) exactly. All amounts are integer pence; the ledger is double-entry (every transaction's postings sum to zero) and belongs in Postgres in production — never solely Firestore.

## Pay-In (money coming in)

| Flow | Endpoint | Rules implemented |
|---|---|---|
| **ACU top-up** | `POST /api/topup` | The 8 packages (£5→£1,000 at 100 ACU/£); demo settles instantly; production creates a Stripe/BitriPay checkout session and posts the ledger tx on the **verified webhook**, crediting purchased-category ACUs (12-month validity). |
| **Marketplace purchase** | `POST /api/checkout` | Commission by seller plan (Creator 25% · Creator Pro 20% · Studio 15% · Business 10% · Enterprise 7.5%; Explorer **cannot sell** — enforced). Processor fee (card 1.4%+20p, BitriPay 1%, mobile money 2%) deducted from the creator side. Remix listings deduct the **30% lineage royalty** from the creator's net into `lineage_royalties`. |
| **Subscriptions** | plan constants | £19/£49/£149/£399/£1,200 with the 20%-of-price ACU allocation rule. |

Verified split (£4.99 sale, Creator Pro, card, remixed listing): platform **£1.00** + processing **£0.27** + ancestor lineage **£1.12** + forker **£2.60** = £4.99 ✓.

## Pay-Out (money going out)

`POST /api/payout` — one wallet pays out **everything**: sales, licences, in-game revenue, lineage royalties, referral earnings.

| Rail | Fee | Timing |
|---|---|---|
| Bank transfer (weekly run) | **Free** | ≤ 7 days |
| Bank transfer — instant | 1% (min 30p) | same day |
| BitriPay | 0.5% (min 20p) | next day |
| Mobile money | 1.5% (min 25p) | next day |

Rules enforced: **£10 minimum** · KYC required at £100 cumulative · destinations are tokenised references, never raw account data (and never echoed back in full) · payouts post `creator_earnings → payout_processing + platform_revenue(fee)` — balanced.

## Ledger accounts

`gateway_clearing` · `deferred_acu_revenue` (ACUs sold ≠ revenue until consumed) · `platform_revenue` · `provider_cogs` · `creator_earnings` · `lineage_royalties` · `escrow` · `payout_processing`. `LedgerTxSchema` **rejects any unbalanced transaction at the type level.**

## Influencer & Referral Programme

Base rule (MONETISATION): referrer earns a share of each referral's **first 12 months** of paid subscription; the referred creator gets **+100 promotional ACUs**; earnings release after the **14-day refund window**; self-referral blocked; 30-day attribution.

| Tier | Threshold | First-year share | Extra |
|---|---|---|---|
| Partner | 0 activated | 5% | code + link, badge |
| Rising Icon | 25 | 7.5% | +1% of *platform* commission on referred sales |
| JOSHRIX Icon | 100 | 10% | +2% of platform commission, co-marketing, partner manager |

The marketplace-fee share always comes out of the **platform's** commission — never a creator's earnings. Referral income credits `creator_earnings` and withdraws through the same payout rails. Endpoint: `GET/POST /api/referrals`.

## Going live checklist

1. ✅ **Checkout is live-capable**: with `STRIPE_SECRET_KEY` set, `POST /api/topup` creates a real Stripe Checkout Session (the wallet page redirects to it automatically). Without keys it stays in demo mode.
2. ✅ **The webhook endpoint exists**: `POST /api/stripe-webhook` (Vercel) and `/stripe-webhook` on the Firebase function — raw-body signature verification, handles `checkout.session.completed` (ACU top-ups by `metadata.kind`, Founder Passes by `metadata.pass`), `charge.refunded`, `payment_intent.payment_failed`. **Settlement happens only here, never on client redirects.**
3. **Register the webhook** (one-time, Stripe Dashboard): Developers → Webhooks → Add endpoint → URL `https://<your-app>.vercel.app/api/stripe-webhook` → select the three events above → copy the signing secret → add `STRIPE_WEBHOOK_SECRET` to Vercel env → redeploy. For Founder Pass Payment Links, add `pass=<founder|founder_pro|first_studio>` in each link's metadata so the webhook records them.
4. Stand up Postgres (Neon) and replace the webhook's structured settlement log with ledger writes + ACU credits keyed by `event.id` (idempotency).
5. Stripe Connect for creator payouts; KYC at the £100 threshold; weekly payout run + instant rail.
6. Keep every split function unchanged — they are the tested source of truth.
