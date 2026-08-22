# GO-TO-MARKET

**JOSHRIX Studio — Nairobi launch, 18 Aug to 15 Nov 2026**

Owner: Justin Nseya · Version 1.0 · 17 Aug 2026

> Every product figure in this document is read from the codebase, not estimated.
> Every money figure is an estimate with its basis stated. Where I could not verify
> something from this environment it is marked **[VERIFY]** rather than asserted.

---

## 1. The decision this document makes

**Launch city: NAIROBI, KENYA.** Not London, not Lagos, not "online".

The reasoning is one line: **the only thing JOSHRIX has that competitors cannot copy is
mobile-money payout**, and Kenya is where mobile money is most deeply embedded in ordinary
economic life. Everywhere else, the product is "another AI game maker" and competes on
features. In Nairobi it is the only option that can actually pay a creator.

| City | Why not |
|---|---|
| **London** | He lives here — but the moat evaporates. UK creators have Stripe, PayPal, Wise. You would compete head-on with every funded AI game tool on features alone. **Kept as the education beachhead only (§5).** |
| **Lagos** | Bigger market, but payments skew bank-transfer and card, not mobile money. Attention is expensive and the scene is crowded. Phase 2 city. |
| **Accra / Kampala** | Right payment behaviour, smaller developer density. Phase 3. |
| **Nairobi** | Deepest mobile-money penetration, English-speaking, high developer density in a small physical area, strong hub culture you can actually walk into. **Chosen.** |

**Consequence to accept:** you are in the UK and the beachhead is 6,800 km away. That is why
the single largest line in the budget is a **local champion**, not advertising (§7).

---

## 2. Two blockers that gate everything

### 2.1 The forge is unproven — HARD GATE

The forge has never produced a game the owner judged good. Two runtime bugs — an unrequested
ocean painted over every sky, and two of three sky colours never rendering — were fixed on
14 Aug 2026 and have **not been through a real forge run**.

**Rule: £0 on paid acquisition until one forged game passes "would I show a stranger this?"**
Acquisition against a disappointing product is worse than none. You burn the audience once,
publicly, and in a community as tight as Nairobi's you do not get a second introduction.

### 2.2 The free tier destroys the paid tier — FIX IN WEEK 1

| Tier | ACU granted | 2D games (~32 ACU each) |
|---|---|---|
| Free grant | **2,000** | **~62** |
| Creator, £19/mo | **380** | **~11** |

**The free tier is five times more generous than the first paid tier.** No funnel, no agency
and no ad spend fixes this — there is currently no rational reason to upgrade. You could
acquire 10,000 users and earn nothing.

**Fix:** one line in `shared/payments.ts`. Either cut the grant to **400 ACU** (~12 games, a
real trial) or raise Creator to **1,500 ACU** (~47 games). **Recommendation: cut the grant to
400 and raise Creator to 1,000.** Highest commercial leverage available today, and it is free.

---

## 3. Positioning

**Do not lead with "AI game maker".** It is crowded, unbelievable, and invites comparison with
funded competitors.

**Lead with this:**

> **Build a game. Get paid to your phone.**
> No install for your players. No 30% store cut. No bank account required.

Three proof points, all verifiable in the product:

1. **Mobile-money payout.** For creators outside the US and EU the alternatives are not worse — they are unavailable.
2. **A failed build refunds itself.** No competitor in this category refunds anything.
3. **You own it outright.** CC0 assets, creator holds the IP, games are not locked to the platform.

**The press story is not the AI.** It is: *"a Nairobi student built a game on a phone, sold it,
and got paid in M-Pesa."* That is a story a journalist runs. "AI generates games" is not.

---

## 4. Customer segments

| # | Segment | Why they buy | Price fit | Target of first 100 |
|---|---|---|---|---|
| 01 | **Nairobi creators & students** | Mobile-money payout. The only option that pays them. | Creator £19 | **40** |
| 02 | **UK educators & coding clubs** | 30 pupils build a real game in one lesson, on Chromebooks, no install, no IT ticket. Human moderation makes it safe for minors. | Studio £149 | **15** |
| 03 | **"I have a game idea" non-coders** | Carried an idea for years; every route needed Unity. Emotional purchase, fast decision. | Creator £19 | **35** |
| 04 | **Brands & agencies wanting mini-games** | A branded game costs £3–15k and six weeks from an agency. Here it is an afternoon and a link. | Business £399 | **10** |

Segment 02 is **15% of customers but roughly 30% of revenue.** Do not deprioritise it because
it is slower.

---

## 5. Nairobi execution — named targets

**[VERIFY] I could not reach any external site from the build environment.** The organisations
below come from general knowledge and **must be confirmed to still exist, and their current
contacts found, before the plan depends on them.** Treat this as a research list, not a
verified list.

### Communities and hubs to approach

| Target | Type | Ask |
|---|---|---|
| **iHub Nairobi** | Innovation hub | Host a free 90-min build session |
| **Moringa School** | Developer bootcamp | Guest session + student game jam |
| **Nairobi Garage / co-working spaces** | Co-working | Meetup venue |
| **University of Nairobi, JKUAT, Strathmore** — CS societies | Universities | Student ambassador + jam |
| **ALX / local dev-training programmes** | Training | Cohort access |
| **Kenyan game-dev Discord / WhatsApp / X circles** | Online | Participate first, post later |

### The Nairobi playbook, in order

1. **Recruit ONE local champion** (§7). Nothing else in this section works without them.
2. **Two weeks of listening.** The champion joins every community and posts nothing. Anyone
   who arrives selling is discounted immediately, and in a tight scene that reputation sticks.
3. **Meetup #1 — "Build a game in 40 minutes"** (~30 people). Everyone leaves with a URL to a
   game they made. That is the whole demo.
4. **Student game jam** (48 hours, ~£300 prize pool). Prizes paid via mobile money —
   **the payout IS the marketing.** People watch the money land.
5. **Meetup #2 — "Get paid"**, focused on selling and payouts, with jam winners on stage.
6. **Harvest referrals.** Ask each active creator for two names. Nairobi's dev scene is small
   enough that 40 customers is reachable by referral alone.

### Non-negotiable before any of this

**Run one real payout to a real Kenyan mobile-money account for £5 and watch it land** (§9).
Promising a payout you have not tested, in the one city that chose you *for* the payout, is
the fastest possible way to destroy the launch.

---

## 6. The first 100 customers

The first 100 are acquired by hand. Anything that scales at this stage is a distraction from
the thing that does not.

| Customers | Play | Method | Cost |
|---|---|---|---|
| **1–10** | Hand-built games, gifted | Forge 10 games for 10 *named* people. Send the link, not a pitch. Ask one question: "what would you change?" These become the case studies. | £5 |
| **11–30** | Community deep-dive | 10 communities, two weeks of participation, then **one** playable link: "I built this, it's free, no account." | £0 |
| **31–50** | 3-school pilot (UK) | Free term of Studio for a named quote and a class photo. One lesson plan, delivered by you on a call. Teachers refer teachers. | £120 |
| **51–70** | Creator seeding | 20 micro-creators (5k–50k followers). Forge a game about *their* channel, free, unasked. Expect 3–5 to post. | £100 |
| **71–85** | Launch platforms | Product Hunt + Show HN + Indie Hackers, same day, **once**. Lead with the playable link. | £0 |
| **86–100** | Share loop | Published games circulate on their own. `/api/traffic` already reports where the funnel breaks. | £0 |

**The one rule that decides whether this works: never send anyone to the homepage.** Send them
to a playable game. The product sells itself in 30 seconds of play and sells nothing in 30
seconds of reading. Every link points at `/games/wonderverse` or a creator's own game.

---

## 7. Budget — real figures

### Basis and honesty

- Vercel Pro is $20/mo, converted at ~£0.80/$ → **£16/mo**. **[VERIFY]** rate moves.
- Kenyan costs converted at roughly **KES 165 = £1**. **[VERIFY] — this rate moves materially and must be re-checked before committing.**
- Agency retainer is a **market-range assumption**, not a quote. Get a real quote (§8).
- AI generation cost uses the measured **£0.08 raw per 2D game** (billed £0.32 at the 4× meter).

### Month 1 · 18 Aug – 16 Sep · Product month

| Line | £ | Note |
|---|---|---|
| Vercel Pro | 48 | 3 months paid up front |
| Neon Postgres | 0 | Free tier sufficient at this scale |
| Email (Resend free tier) | 0 | 3,000/mo covers 100 customers |
| AI generation — seeding & testing | 50 | ~600 test games at raw cost |
| Real payout test (M-Pesa) | 50 | Includes fees and one failed attempt |
| Local champion — half month, starts Wk 3 | 150 | See below |
| Design tooling (Canva Pro) | 12 | |
| **Month 1 total** | **£310** | Almost no marketing. That is deliberate. |

### Month 2 · 17 Sep – 16 Oct · Prove someone pays

| Line | £ | Note |
|---|---|---|
| Local champion — full month | 300 | ~KES 50,000/mo, ~10 hrs/week **[VERIFY rate]** |
| Meetup #1 — venue + refreshments, 30 people | 200 | Hubs often waive venue if you cater |
| Paid channel tests — 6 × £50 | 300 | Find one channel under £40 CAC; kill the rest |
| School pilot materials, print, travel | 120 | 3 UK schools |
| Creator seeding — thank-you gifts | 100 | 20 creators |
| Infrastructure + tools | 12 | |
| **Month 2 total** | **£1,032** | |

### Month 3 · 17 Oct – 15 Nov · Prove it repeats

| Line | £ | Lean | Recommended |
|---|---|---|---|
| Local champion | 300 | ✓ | ✓ |
| Meetup #2 | 200 | ✓ | ✓ |
| Student game jam — prize pool | 300 | ✓ | ✓ |
| Champion travel & logistics | 150 | ✓ | ✓ |
| Infrastructure + tools | 12 | ✓ | ✓ |
| Marketing partner — 2 months, month-to-month | 3,000 | — | ✓ |
| **Month 3 total** | | **£962** | **£3,962** |

### 90-day totals

| | Lean (founder-led) | Recommended (with agency) |
|---|---|---|
| Month 1 | £310 | £310 |
| Month 2 | £1,032 | £1,032 |
| Month 3 | £962 | £3,962 |
| Subtotal | £2,304 | £5,304 |
| Contingency 15% | £346 | £796 |
| **TOTAL** | **£2,650** | **£6,100** |

**Recommendation: run Lean for months 1–2. Only commit agency money in month 3, and only if a
channel is already working.** Paying an agency to find product-market fit is paying someone
else to learn what you need to know yourself.

### What the money buys back

Day-90 target of 100 paying customers, at a realistic mix:

| Plan | Customers | MRR |
|---|---|---|
| Creator £19 | 80 | £1,520 |
| Creator Pro £49 | 12 | £588 |
| Studio £149 | 6 | £894 |
| Business £399 | 2 | £798 |
| **Total** | **100** | **£3,800/mo** |

- **Blended CAC (Lean): £26.50.** Total spend ÷ 100 customers.
- **Blended CAC (Recommended): £61.** Above the £40 target — because it includes one-off launch
  investment, not just acquisition. **Marginal CAC in the proven channel must be under £40.**
  Judge the channel on marginal cost, judge the launch on blended.
- **Payback: under one month at £3,800 MRR.**
- **Break-even on infrastructure (~£20/mo): 4 customers.**

> These are targets, not forecasts. Replace every one with a measured number the moment there
> is anything to measure.

---

## 8. Marketing partner

**Recommended: [marketwaros.com](https://www.marketwaros.com/)** — engaged in **month 3 only**,
for the paid, brand and B2B work that founder-led outreach cannot cover.

> **[VERIFY] I could not reach this domain from the build environment.** I have not confirmed
> what they offer and have deliberately written nothing about their services. Check case
> studies, references and pricing yourself before committing budget.

### The brief

- **Segment 04** — branded mini-games for brands and agencies. Biggest cheque, longest cycle, no time for it yourself.
- **Paid channel testing** — £50 per channel, find CAC under £40, kill the rest.
- **Brand and positioning** — one line, used everywhere, that is not "AI game maker".
- **PR around the payout story** (§3) — that is the angle a journalist will run.

### Do NOT outsource

- **The first 30 customers.** Founder-led, or you learn nothing about why people say no.
- **Community participation.** An agency posting in a Nairobi Discord is detected instantly and costs you the community permanently.
- **Product claims.** Every published number is verified against the codebase by `tests/t16`. An agency inventing "10× faster" breaks that, and this audience checks.

### Contract terms to insist on

1. **Month-to-month for the first 3 months.** No annual retainer before a channel is proven.
2. **Paid on qualified signups, not impressions.**
3. **You own every account, pixel, list and creative asset.** Non-negotiable.
4. **No claim ships without your sign-off.**

---

## 9. Suppliers

| Supplier | Supplies | Cost | If it fails | State |
|---|---|---|---|---|
| OpenAI / Anthropic / Google | Game generation | ~£0.08 raw per 2D game | Chain fails over across all three automatically | Live |
| Vercel Pro | Hosting, serverless, cron | £16/mo | Total outage; no mitigation — accepted | Live |
| Neon | Postgres — wallets, ledger, games | £0 → £19/mo | Platform down. **No backup/restore drill has been run.** | **Untested** |
| Stripe | Card payments, payouts | 1.5% + 20p | No revenue. **Connect onboarding unfinished.** | **Incomplete** |
| Mobile-money rail | Payouts outside US/EU | 1–3% | **Kills the entire Nairobi thesis.** | **Must test** |
| SMTP / Resend | Receipts, verification, newsletter | £0–15/mo | Silent failure — users never learn a build finished | Live |
| Kenney (kenney.nl) | 2,119 CC0 models, 2,553 sprites | Paid, owned | Nothing — CC0, vendored | Owned |
| Quaternius | Vehicles in; characters/monsters/animals pending | Paid, owned | Nothing. **Upload the character packs.** | **Not uploaded** |

### How to source a new supplier

1. **Licence first, quality second.** CC0 or explicit commercial licence, or it cannot go near a platform that *sells* the output. This rules out most AI-generated asset vendors.
2. **Test with the real pipeline before paying.** `tools/validate-models.mjs` opens every model in a real browser. That check is why the library contains no wireframes or blank characters.
3. **Never single-source anything touching money or generation.** The AI chain has three providers. Payments should get a second rail before scale.
4. **Prefer owned over rented.** Assets are bought once and vendored — nothing can be revoked or repriced.

### Worth adding next

- **Mixamo** (free, Adobe account) — human-proportioned rigged characters. The ingest already handles them.
- **A merchant-of-record** (Paddle, Lemon Squeezy) — removes VAT/tax handling entirely before international scale.
- **CC0 audio** — 705 sound files already sit in the mirror, un-ingested. Free quality win.
- **Skip AI 3D generators** (Meshy, Tripo, Hyper3D) for the base library: unreliable rigging, heavy meshes, licensing that muddies the CC0 ownership promise. Fine later for one-off hero props.

---

## 10. The 90-day plan

### Phase 1 · Days 1–30 · 18 Aug – 16 Sep
**Goal: prove the product. Number: 10 forged games you would show a stranger.**

| Week | Dates | Actions |
|---|---|---|
| 1 | 18–24 Aug | Forge WonderVerse in 3D live. Forge 5 more concepts. **Fix the pricing inversion (§2.2).** Rotate the Neon password, set `NEWSLETTER_SECRET`. |
| 2 | 25–31 Aug | **Upload the Quaternius character packs.** Run one real mobile-money payout. Run the Neon backup/restore drill. |
| 3 | 1–7 Sep | **Recruit the Nairobi champion.** 10 hand-built games for 10 named people. Write the school lesson plan. |
| 4 | 8–14 Sep | Champion joins 10 communities and posts nothing. Analytics baseline set. |

**Spend: £310. Exit test: would you put a forged game in front of an investor? If no, repeat the phase — do not advance.**

### Phase 2 · Days 31–60 · 17 Sep – 16 Oct
**Goal: prove someone will pay. Number: 25 paying customers, 3 school pilots.**

| Week | Dates | Actions |
|---|---|---|
| 5 | 15–21 Sep | Start sharing in communities. One playable link, no pitch. Track which community converts — most will not. |
| 6 | 22–28 Sep | **Meetup #1 in Nairobi.** 30 personalised emails to named UK teachers. |
| 7 | 29 Sep–5 Oct | Creator seeding — 20 personalised games. Launch the £50 paid channel tests. |
| 8 | 6–12 Oct | First newsletter (dry-run first). 8 feature articles live. Referral mechanic on. |

**Spend: £1,032. Exit test: can you name the channel that produced the most paying customers?**

### Phase 3 · Days 61–90 · 17 Oct – 15 Nov
**Goal: prove it repeats. Number: 100 paying customers, marginal CAC under £40.**

| Week | Dates | Actions |
|---|---|---|
| 9 | 13–19 Oct | **Public launch — Tue 13 Oct.** Product Hunt + Show HN + Indie Hackers, same day. One shot. |
| 10 | 20–26 Oct | **Student game jam, Nairobi.** Prizes paid by mobile money, publicly. Double down on the one working channel; kill the rest. |
| 11 | 27 Oct–2 Nov | **Meetup #2 — "Get paid".** Convert school pilots to paid; ask each for two referrals. Engage the marketing partner if a channel is proven. |
| 12–13 | 3–15 Nov | Measure honestly. Re-plan. Decide Phase 2 city: Lagos or Accra. |

**Spend: £962 lean / £3,962 with agency. Exit test: if you spend £1,000 next month, can you predict roughly how many customers arrive? That is the definition of having a channel.**

---

## 11. Scoreboard

| Metric | Why it is the one that matters | Day 30 | Day 60 | Day 90 |
|---|---|---|---|---|
| Games forged | Product works at all | 10 | 100 | 500 |
| Games published | Good enough to put a name to | 5 | 40 | 200 |
| Paying customers | Someone values it in money | 0 | 25 | 100 |
| Activation rate | Signup → first finished game | — | 40% | 60% |
| Week-4 retention | Business or novelty | — | 20% | 35% |
| Shares per published game | Whether the loop compounds | — | 1.5 | 3.0 |
| Marginal CAC, best channel | Whether it can scale | — | — | < £40 |

`/api/traffic` already reports where the funnel breaks in plain words. Newsletter clicks are
tagged, so email traffic is never miscounted as direct.

---

## 12. Risks, ranked

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **The forge stays mediocre** | Fatal | Phase 1 exists solely for this. Phase 2 does not begin until it clears. |
| 2 | **Free tier cannibalises paid** | Severe | One-line fix, Week 1 (§2.2). |
| 3 | **Mobile-money payout does not actually work** | Fatal to the city choice | Run one real £5 payout in Week 2, before any Nairobi promise. |
| 4 | **No local champion hired** | Severe | Nairobi cannot be run remotely from the UK. If nobody is hired by Week 4, switch the launch city to London and re-plan. |
| 5 | **FX and cost assumptions wrong** | Moderate | All Kenyan figures marked **[VERIFY]**. Confirm before committing. |
| 6 | **Moderation becomes the bottleneck** | Moderate | Human review gates publishing. Fine now; plan the queue before day 90. |
| 7 | **Data loss** | Severe | Wallets and ledger in Neon, no drill run. Do it in Week 2. An untested backup is not a backup. |

---

## 13. Monday morning — the first five things

1. **Forge WonderVerse in 3D on the live site.** Everything waits on the answer.
2. **Fix the pricing inversion.** One line. Highest commercial leverage available today.
3. **Upload the Quaternius character packs.** You own them. Biggest quality jump, zero cost.
4. **Rotate the Neon password** and set `NEWSLETTER_SECRET`.
5. **Run one real £5 mobile-money payout** and watch it land.

---

### Sources and confidence

**Read from the codebase (facts):** 2,435 models · 2,553 sprites · 34 packs · 178 animated
characters · plan prices £19/£49/£149/£399/£1,200 · commission 25%→7.5% · free grant 2,000 ACU ·
ACU = £0.01 · ~£0.32 billed per 2D game, ~£0.49 per 3D · 22 marketed capabilities · 4× metered
markup.

**Estimates with stated basis:** all money figures in §7, CAC, LTV, MRR mix, day-30/60/90 targets.

**[VERIFY] — could not be checked from this environment:** marketwaros.com and its services ·
all named Nairobi organisations · KES/£ exchange rate · Kenyan venue, stipend and agency rates ·
current mobile-money provider fees.
