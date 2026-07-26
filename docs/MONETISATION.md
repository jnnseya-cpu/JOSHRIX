# JOSHRIX Studio — Monetisation Model

## Commercial Objective

Revenue is generated every time users: create a game · generate an asset · use an AI agent · build or test a game · publish a game · host a game · sell a game · sell an asset · licence a template · receive an in-game payment · promote a marketplace listing · export a commercial build. Predictable subscription revenue combines with high-margin consumption revenue and recurring marketplace commissions through **six principal revenue engines**: subscriptions, ACU consumption, marketplace commissions, publishing and hosting fees, in-game transaction fees, and enterprise/white-label licensing.

## Platform Revenue Channels

Sixteen channels: subscriptions · ACU consumption · build charges · hosting · marketplace commission · in-game payment commission · creator payout processing · premium analytics · publishing services · white-label licensing · asset generation · team seats · enterprise deployment · promotion and featured placement · transaction escrow · API usage.

## The Fixed Commercial Rule — 4× Provider-Cost Markup

For every £1 charged by an external AI, cloud, image, audio, video, game-build, or infrastructure provider, the platform charges the user **at least £4**. The platform must never price an AI operation below this floor.

| Provider cost | User charge | Gross difference |
|---|---|---|
| £0.25 | £1.00 | £0.75 |
| £1.00 | £4.00 | £3.00 |
| £5.00 | £20.00 | £15.00 |
| £10.00 | £40.00 | £30.00 |
| £100.00 | £400.00 | £300.00 |

This is a 4× revenue multiple on provider cost — a 75% gross margin before internal infrastructure, payment processing, support, tax, and operational costs.

```
Minimum user price = attributable provider cost × 4
Full price = provider cost × 4 + platform execution fee + IP value
           + hosting cost + commercial licence fee + risk reserve
```

## ACU Commercial Structure

**ACU = Artificial Creation Unit** (the operative definition; "AI Compute Unit" was the working name). Retail conversion:

- **100 ACUs = £1** of user spending value; 1 ACU = £0.01 retail
- Under the 4× rule: maximum provider cost behind 100 ACUs = £0.25; behind 1 ACU = £0.0025

**Dynamic pricing per action:** `Base ACUs = provider cost in GBP × 400`

| AI action | Provider cost | Minimum user charge | Minimum ACUs |
|---|---|---|---|
| Generate game title | £0.02 | £0.08 | 8 |
| Generate game blueprint | £0.25 | £1.00 | 100 |
| Generate character image | £0.50 | £2.00 | 200 |
| Generate level package | £1.50 | £6.00 | 600 |
| Generate playable prototype | £5.00 | £20.00 | 2,000 |
| Run advanced AI testing | £10.00 | £40.00 | 4,000 |

The final charge may exceed the minimum when the action includes premium platform value.

## The Subscription ACU Rule — 20/80

**Exactly 20% of every subscription payment converts into user ACUs.** The remaining 80% pays for platform access: workspace access, project management, standard storage, marketplace access, security, version history, collaboration, game hosting allowance, dashboard access, platform maintenance, support, and product development.

**ACU allocation formula:**

```
Monthly ACU value = subscription price × 20%
Monthly ACUs     = subscription price × 20     (e.g. £49 × 20 = 980 ACUs)
```

**Subscription economics** (when all included ACUs are consumed): 20% of subscription value allocated to ACUs → maximum underlying provider cost 5% → **95% of subscription value retained before operating costs**. Example at £100: £20 ACU retail allocation, ≤£5 provider cost, £95 retained. This protects platform profitability while giving users visible AI spending power.

## Subscription Tier Specifications (detailed)

### Explorer — Free
Acquire users and prove the platform's value. **Includes:** one active project; limited templates; basic AI assistant; public game preview; JOSHRIX watermark; community support; limited marketplace browsing; **100 one-time introductory ACUs**; non-commercial publishing only; no source export; no payout access. **Commercial objective:** convert after the first playable game; prevent repeated free-account abuse; require payment verification before commercial use.

### Creator — £19/month · 380 ACUs (£3.80 retail, ≤£0.95 provider cost)
For beginners and independent creators. **Includes:** three active projects; prompt-to-game; basic Game Director, Blueprint, Code, and Asset agents; web publishing; five private previews; commercial-use eligibility; basic marketplace selling; basic analytics; standard hosting; one creator identity; community support; JOSHRIX branding on hosted pages. **Commission: 25%.** Best for first-time creators, students, hobbyists, educational games, basic web-game sellers.

### Creator Pro — £49/month · 980 ACUs (£9.80 retail, ≤£2.45 provider cost)
For serious creators earning revenue. **Adds:** ten projects; advanced Game Director; Mechanics Architect, Level Design, Narrative, and Economy Design agents; advanced asset generation; source-code export; custom domain; watermark removal; automated QA; behaviour analytics; revenue dashboard; seller verification; priority queue; email support; three identities. **Commission: 20%.** Best for commercial creators, influencers, indie developers, educational-content producers, template sellers.

### Studio — £149/month · 2,980 ACUs (£29.80 retail, ≤£7.45 provider cost)
For development teams and professionals. **Adds:** fifty projects; ten team seats; Executive Orchestrator; Technical Director, Production Manager, Art Director, Audio Director agents; advanced QA Director; Autonomous Player Testing and Balance Simulation agents; Git integration; team permissions; approval workflows; shared asset library; build history; version comparison; staging + production environments; advanced marketplace analytics; collaboration tools; reduced hosting charges; priority support. **Commission: 15%.** Best for indie studios, creative agencies, dev teams, professional asset sellers, education businesses, media companies.

### Business — £399/month · 7,980 ACUs (£79.80 retail, ≤£19.95 provider cost)
For brands, agencies, publishers, and game businesses. **Adds:** unlimited draft projects (fair-use); fifty seats; multiple brands and workspaces; white-label games; branded portals; lead-capture games; campaign analytics; customer-data integration; API access; advanced revenue intelligence; portfolio management; commercial licence management; custom domains; advanced segmentation; churn prediction; A/B testing; multilingual generation; regional personalisation; premium support; service-level targets; ten brand identities. **Commission: 10%.** Best for marketing agencies, global brands, publishers, educational institutions, franchise operators, large creator businesses, promotional-game producers.

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
| Business | 10% |
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
