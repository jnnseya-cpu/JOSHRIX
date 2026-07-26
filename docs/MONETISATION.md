# JOSHRIX Studio — Monetisation Model

## Platform Revenue Channels

Sixteen channels: subscriptions · ACU consumption · build charges · hosting · marketplace commission · in-game payment commission · creator payout processing · premium analytics · publishing services · white-label licensing · asset generation · team seats · enterprise deployment · promotion and featured placement · transaction escrow · API usage.

## ACU (AI Compute Units) — The Core Currency

ACU is the primary consumption metric of the platform. Every forge cycle consumes ACU proportional to compute intensity, agent usage, model API costs, asset generation volume, and QA depth — aligning platform revenue directly with value delivered: operators pay more when they produce more.

| Forge Stage | Estimated ACU Cost | Driving Factor |
|---|---|---|
| Idea Agent synthesis | 10–25 ACU | LLM API calls; market data queries |
| Strategic Agent blueprint | 20–40 ACU | Complex reasoning; financial modelling |
| Code Agent (standard game) | 150–400 ACU | Code generation volume; complexity tier |
| Asset Agent (standard pack) | 100–300 ACU | Image/audio generation volume |
| Economy Agent | 15–30 ACU | Revenue modelling computation |
| QA Agent (full validation) | 30–60 ACU | IP similarity scan; compliance checks |
| Deployment Agent | 5–10 ACU | CDN operations; marketplace listing |
| **Total — Starter Game** | **~330–865 ACU** | — |
| **Total — Professional Game** | **~1,000–2,500 ACU** | Larger asset packs; more complex code |

## Creation Credits & Fixed-Price Packages

Alongside subscriptions, casual creators buy credits directly (£1 ≈ 100 credits, mapped onto ACU):

| Action | Indicative Credits |
|---|---|
| Generate game idea | 20 |
| Create game design | 50 |
| Generate assets | 100 |
| Build prototype | 300 |
| Add payment system | 500 |
| Create full game | 1,000–10,000 |

Fixed-price forge packages for one-shot creators: **Starter £19 · Creator £49 · Commercial £149 · Pro Studio £499 · Enterprise White Label £2,500+** (game-tier packages surfaced in the journey: Starter Game £19, Playable Web Game £49, Mobile-Ready Game £99, Advanced Game with Marketplace £249, Commercial Game Package £499+). Packages are pre-purchased ACU bundles with a defined scope — the ledger underneath is identical.

## Marketplace Commission & Hosting

- **Marketplace commission**: 20–30% per sale (e.g. £100 sale → £30 platform, £70 creator), within the 8–15% floor for subscription-tier operators — casual package users pay the higher band.
- **Game hosting**: free tier with watermark · £9/month per published game · £29/month for monetised games · £99/month for high-traffic games.
- **In-game payment commission**: on every in-game purchase — payment processor fee first, then a platform service fee of 5–15% (standard 10%), creator receives the balance. Example: player pays £10 → processor fee → platform £1 → creator remainder.

## Revenue Share Logic

| Sale Type | Split | Terms |
|---|---|---|
| Standard marketplace sale | Creator 70% / Platform 30% | Default for package-tier creators |
| Non-exclusive sale | Creator 70% / Platform 30% per copy | Creator sells unlimited copies |
| Exclusive sale | Creator 75% / Platform 25% | Creator sets price; buyer gets full commercial licence; creator forfeits resale rights |
| In-game purchases | Platform 10% after processor fees | Creator receives balance to wallet |
| Subscription-tier operators | 8–15% commission band | Lower commission is a core subscription benefit |

## Subscription Plans

| Plan | Price | ACU Included | Forge Cycles | Key Features |
|---|---|---|---|---|
| Explorer | £29/month | 500 ACU | 1 active cycle | Core fleet; marketplace listing; IP vault; community support |
| Operator | £99/month | 2,000 ACU | 3 concurrent cycles | All Explorer + Economy Lab; priority queue; API access; email support |
| Studio | £299/month | 8,000 ACU | 10 concurrent cycles | All Operator + team RBAC; studio analytics; white-label marketplace store; priority support |
| Enterprise | Custom | Custom ACU | Unlimited | All Studio + white-label OS; dedicated agent fleet; SLA; custom integrations; account manager |
| Education | £79/seat/year | 200 ACU/student/term | Supervised | Supervised forge; IP assignment controls; instructor dashboard; institution billing |

## Subscription Framework v2 (launch structure)

The refined six-tier framework (supersedes the table above for launch; the original tiers are preserved as the intermediate model):

| Tier | Price | Includes |
|---|---|---|
| Explorer | Free | Limited projects and generations; watermark; public templates; non-commercial publishing; 100 introductory ACUs |
| Creator | £19/month | More projects; commercial rights subject to asset licences; basic marketplace listing; web publishing; standard analytics |
| Creator Pro | £49/month | Advanced agents; more storage; source export; behaviour analytics; multiplayer prototype access; reduced marketplace commission |
| Studio | £149/month | Team workspace; approval workflows; advanced QA; build pipelines; shared assets; commercial templates; priority execution |
| Business | £399/month | Multiple brands; white-label games; campaign analytics; lead capture; advanced permissions; API access |
| Enterprise | Custom | Private environment; SSO; private model gateway; dedicated support; custom compliance; data residency; custom agent policies |

### ACU Pricing Rule

**Retail ACU charge ≥ 4 × attributable provider cost.** The cost engine must include: model inference, image generation, audio generation, 3D generation, build compute, storage, bandwidth, testing compute, payment fees, support reserve, refund reserve.

### Subscription ACU Allocation

Twenty per cent of subscription value converts into monthly ACUs (e.g. Creator Pro £49 → £9.80 of ACUs; the remainder supports platform access, storage, and margin). Unused promotional ACUs may expire or roll over subject to plan rules.

### Tiered Marketplace Commission

| Seller tier | Commission |
|---|---|
| Free seller | 30% |
| Creator | 25% |
| Creator Pro | 20% |
| Studio | 15% |
| Enterprise | Negotiated |

### Revenue Ledger

Every transaction produces double-entry records (the schema-level ledger of [GAP-ANALYSIS.md](GAP-ANALYSIS.md) §A1):

```json
{
  "transaction_id": "txn_123",
  "gross_amount_gbp": 100,
  "processor_fee_gbp": 3.20,
  "platform_fee_gbp": 20,
  "tax_withheld_gbp": 0,
  "creator_net_gbp": 76.80,
  "ledger_entries": []
}
```

## Revenue Stream Architecture

| Revenue Stream | Model | Estimated Margin |
|---|---|---|
| Subscription (SaaS) | Recurring monthly/annual per operator | 85–90% |
| ACU Top-Up | Additional ACU beyond plan allowance | 60–70% (after AI API costs) |
| Marketplace Commission | 8–15% of each game/asset sale | 85%+ |
| Marketplace Listing Fee | Optional promoted listings: £9.99–£99/month | 90%+ |
| IP Certification Premium | Enhanced IP certificate with legal backing: £49/title | 70% |
| White-Label Licensing | Enterprise OS licensing: £5K–£50K/month | 80%+ |
| API Revenue | Pay-per-call for external partners beyond free tier | 70% |
| BitriPay Gateway Fee | 0.5–1.5% on marketplace transactions | Shared with BitriPay |
| Data Intelligence | Anonymised market trend reports: £499–£4,999/report | 90%+ |
| Priority Forge Queue | Skip-the-queue upgrade: £9.99/forge cycle | 75% |
