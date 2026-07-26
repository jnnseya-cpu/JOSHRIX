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

### Enterprise — from £1,200/month · 24,000 base ACUs (£240 retail, ≤£60 provider cost)
For major publishers, governments, universities, and global businesses. **Adds:** 250+ seats; private enterprise workspace; private agent configurations; custom AI model routing; SSO; RBAC; data residency options; dedicated security policies; custom data-retention rules; private marketplace; internal asset library; white-label creator platform; enterprise API limits; advanced audit logs; dedicated onboarding; account manager; custom SLA; procurement support; private cloud or hybrid deployment; custom commercial terms. **Commission: negotiated 5–10%.** Additional enterprise services charged separately.

### Subscription Comparison

| Plan | Monthly price | Monthly ACUs | Active projects | Seats | Marketplace commission |
|---|---|---|---|---|---|
| Explorer | £0 | 100 one-time | 1 | 1 | Cannot sell |
| Creator | £19 | 380 | 3 | 1 | 25% |
| Creator Pro | £49 | 980 | 10 | 3 | 20% |
| Studio | £149 | 2,980 | 50 | 10 | 15% |
| Business | £399 | 7,980 | Fair-use unlimited | 50 | 10% |
| Enterprise | From £1,200 | From 24,000 | Custom | 250+ | 5–10% |

### Annual Subscription Model

**Pay annually, receive 15% off.** The ACU allocation must remain exactly 20% of the amount actually paid — never allocate the full monthly ACU quota after discounting (that would push the ACU percentage above 20%). Example, Creator Pro: £588 standard annual → £499.80 discounted → £41.65 monthly recognised value → **833 ACUs/month** (or presented as 9,996 ACUs annually). ACUs may be released monthly to control provider spending and reduce refund risk.

## ACU Top-Up Packages

| Price | ACUs | Retail value |
|---|---|---|
| £5 | 500 | £5 |
| £10 | 1,000 | £10 |
| £25 | 2,500 | £25 |
| £50 | 5,000 | £50 |
| £100 | 10,000 | £100 |
| £250 | 25,000 | £250 |
| £500 | 50,000 | £500 |
| £1,000 | 100,000 | £1,000 |

Maximum provider exposure per package: **25% of package price** (e.g. £100 package → ≤£25 provider cost → ≥£75 gross difference). **Bonus ACUs** are permitted only where the effective markup stays ≥4× (a £100/11,000-ACU package has £110 effective retail; provider cost still capped at £25), and should be steered toward low-cost internal actions rather than expensive external generation.

## ACU Wallet Rules

**Wallet categories:** subscription · purchased · promotional · referral · refund · enterprise contract ACUs.

**Consumption order:** promotional → subscription → purchased → contract.

**Expiry:** promotional 30–90 days · subscription ACUs expire at cycle end or roll over up to one month · purchased valid 12 months · enterprise per contract.

**Hard-stop policy at zero balance:** stop chargeable AI operations; preserve the project; allow manual editing; allow previewing previous builds; display cost before requesting top-up; **never create unexpected negative balances**.

**Auto top-up:** £5 / £10 / £25 tiers plus custom thresholds for business users — explicit consent and clear notification required.

## AI Action Pricing (indicative retail)

| Concept & planning | ACUs | | Visual generation | ACUs |
|---|---|---|---|---|
| Game-name generation | 10 | | Basic icon | 20–50 |
| Concept improvement | 25 | | Character concept | 100–250 |
| Commercial opportunity analysis | 75 | | Character variation | 50–150 |
| Full Game Blueprint | 100–300 | | Environment image | 100–300 |
| Full Game Design Document | 300–800 | | UI kit | 300–800 |
| Monetisation strategy | 150 | | Animation set | 500–2,000 |
| Game-economy design | 200–500 | | 3D asset generation | 500–5,000 |

| Game production | ACUs | | Testing | ACUs |
|---|---|---|---|---|
| Simple game mechanic | 100–500 | | Basic QA scan | 100 |
| Level generation | 150–1,000 | | Performance test | 200 |
| Full prototype | 1,000–5,000 | | Accessibility review | 150 |
| Commercial starter build | 5,000–25,000 | | Security review | 300 |
| Advanced game build | Dynamic | | 100 AI playtests | 500 |
| Multiplayer infrastructure | Custom quote | | 1,000 AI playtests | 3,000 |
| | | | Economy simulation | 500–2,000 |

Every action must show: estimated ACUs · maximum ACUs · expected output · provider dependency · refund rule · user approval.

## Outcome-Based Game-Creation Packages

For users who do not want a subscription:

| Package | Price | Includes |
|---|---|---|
| Prototype Launch Pack | £49 | Game blueprint; one basic playable web prototype; basic assets; one level; basic QA; private preview |
| Creator Launch Pack | £199 | Commercial blueprint; up to five levels; basic monetisation; web publishing; marketplace listing; standard QA; basic analytics |
| Commercial Game Pack | From £499 | Full production plan; advanced AI agents; custom art direction; ten+ levels; game economy; automated testing; commercial publishing; marketplace licence setup |
| Studio Production Pack | From £2,500 | Dedicated production workflow; advanced architecture; team collaboration; source export; behaviour analytics; commercial launch support |

Packages include a defined ACU allowance; additional consumption is charged from the user wallet.

## Marketplace Revenue Model (detailed)

Revenue on every sale of: complete games, templates, characters, environments, music, sounds, mechanics, code modules, UI packs, level packs, commercial licences, white-label games.

**Commission calculation:** £100 sale × 20% commission → £20 platform, £80 creator gross. Payment processing, applicable tax, refunds, and withholding are deducted separately.

**Exclusive game sales:** 15–20% commission for verified exclusive acquisitions + 2–5% escrow fee + optional legal-document fee + optional technical-verification fee.

**Resale royalties:** creators may set a royalty on eligible secondary sales — e.g. £500 secondary sale → 5% (£25) original-creator royalty + 10% (£50) platform commission, seller receives the remaining net.

## Game Hosting Revenue (detailed)

| Tier | Price | Includes |
|---|---|---|
| Free | £0 | Limited traffic; JOSHRIX branding; public projects; no SLA |
| Creator | £9/game/month | Basic bandwidth; standard analytics |
| Commercial | £29/game/month | Custom domain; monetisation; enhanced analytics; larger traffic allowance |
| Professional | From £99/game/month | High traffic; advanced analytics; priority infrastructure; regional distribution |
| Multiplayer | Metered | Charged by concurrent players, server hours, data transfer, matchmaking events, and regions — the 4× rule applies to variable hosting consumption |

## In-Game Revenue Model

A native payment and entitlement layer supporting: game purchases, subscriptions, game passes, cosmetic items, additional levels, virtual currencies, tournament access, educational licences, premium content.

| Plan | Platform transaction fee |
|---|---|
| Creator | 15% |
| Creator Pro | 12% |
| Studio | 10% |
| Business | 8% |
| Enterprise | Negotiated |

External payment-processing fees are charged separately. **No commission is taken from purely offline or externally processed sales unless the platform supplied the transaction, entitlement, or marketplace infrastructure.**

## Additional Revenue Engines

- **Featured marketplace placement** — daily promotion, weekly featured listing, category sponsorship, homepage promotion, search boosting. £10–£50 for individual creators; £100–£1,000+ for commercial campaigns. **Promoted listings must be visibly labelled.**
- **Game certification** — paid certifications: Commercial Ready, Rights Verified, Performance, Accessibility, Security review.
- **Human specialist marketplace** — 15% commission when users hire developers, artists, writers, animators, musicians, QA testers, or marketing specialists.
- **Publishing services** — app-store preparation, marketing creative, game trailers, store optimisation, localisation, age-rating support, legal document templates.
- **Enterprise white label** — setup fee (£10,000–£100,000+) + monthly platform licence + AI usage + hosting + seats + support + custom development.

## Creator Growth Programme

**Referrals:** referrer receives 5% of the first year's net subscription revenue; referred customer receives bonus promotional ACUs; commission paid only after the refund period; fraud detection and self-referral blocking required.

**Creator Partner levels:**

| Level | Role | Benefit |
|---|---|---|
| Affiliate | Promotes the platform | Commission on subscriptions |
| Template Creator | Sells templates and assets | Marketplace earnings |
| Verified Studio | Produces games for customers | Receives leads; lower marketplace commission |
| Regional Partner | Recruits creators in a country/language market; provides training and support | Negotiated revenue share |

## Margin Protection Controls

Profitability is calculated **before every chargeable AI operation**. Required cost components: AI model cost + image-generation cost + audio-generation cost + video-generation cost + 3D-generation cost + build-compute cost + testing cost + bandwidth + storage + payment fees + refund reserve + support reserve.

**Pricing guardrail** — the user charge is the *greater* of:

```
Provider cost × 4    OR    Minimum platform action price
```

Example: provider cost £2 → 4× minimum £8; minimum commercial action price £12 → **user charge £12**. The higher amount always applies.

**Margin alerts** — the system stops or reviews an action when: provider cost changes unexpectedly · a generation loop repeats · user charge falls below 4× cost · free-tier usage becomes commercially unsustainable · storage or bandwidth exceeds plan allowances · refund rates rise · a provider increases pricing. (Enforced by the Cost Governor Agent.)

## Refund and Failure Policy

| Outcome | When |
|---|---|
| **Full ACU refund** | Provider fails before producing output · build does not start · double charge · platform error corrupts the operation |
| **Partial refund** | Some assets generated successfully · build completed but an optional component failed · user cancels after chargeable execution started |
| **No automatic refund** | User simply dislikes a valid output · user deletes the output · input violated policy · user exceeded a clearly displayed technical limitation |

One-click regeneration or quality credits may be offered as a customer-experience measure.

## Commercial Targets

| Stream | Target |
|---|---|
| Subscription gross margin | >85% before sales and administrative costs |
| ACU gross margin | ≥75% before internal operating costs; preferred 80–90% for internal/cached actions |
| Marketplace commission | 15–30% depending on plan |
| Hosting margin | ≥65%; preferred 75%+ |
| In-game payments | 8–15% platform fee |
| Enterprise contracts | Annual recurring; ≥60% gross margin; paid implementation and onboarding |

## Final Subscription Positioning

| Tier | Message |
|---|---|
| Explorer | *Start creating. No technical skills required.* |
| Creator | *Turn your first game idea into something playable.* |
| Creator Pro | *Create, publish and earn from commercial games.* |
| Studio | *Operate an AI-powered game-development team.* |
| Business | *Create branded games, campaigns and revenue-generating game portfolios.* |
| Enterprise | *Deploy a private AI game-creation and publishing ecosystem.* |

## The Final Commercial Flywheel

```
User subscribes → 20% becomes ACUs → user creates a game
→ additional ACUs purchased → game is hosted → game listed on marketplace
→ game is sold → platform receives commission → players make in-game purchases
→ platform receives transaction fee → creator reinvests earnings into more ACUs
→ more games are created and sold
```

The platform earns at the beginning, during production, at publication, at sale, and throughout the game's commercial life.

## The Final Commercial Rule

**Every provider cost must produce at least four times that amount in user revenue, while exactly 20% of every subscription payment is returned to the user as ACUs.** This gives users visible creation value while protecting the platform with predictable subscription income, controlled AI consumption, and multiple recurring revenue streams.

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
