# JOSHRIX Studio — Market Position & Competitive Pricing

Researched August 2026. Competitor figures are cited; treat them as accurate to
the date of the source, since every one of these companies changes pricing
frequently. Our own figures are read directly from `shared/payments.ts` and
`api/_gateway.ts`, not from marketing copy.

---

## 1. Who we are actually competing with

The market splits into four groups that are usually lumped together. They are
not the same business, and we compete with each differently.

| Group | Examples | What they sell | Our overlap |
|---|---|---|---|
| **AI game creators** | Rosebud AI | Prompt-to-game, browser-playable | **Direct — head to head** |
| **AI app builders** | Lovable, Bolt.new, v0 | Prompt-to-web-app, general purpose | Partial: same technology, different buyer |
| **Traditional game makers** | Buildbox | No-code editor, human does the design | Indirect: same buyer, different method |
| **Distribution platforms** | Roblox, Steam, itch.io, App Store | Audience + payments, you bring the game | We compete on *take rate*, and we partner on reach |

---

## 2. Price comparison — subscriptions

| Platform | Entry price | What you get | Source |
|---|---|---|---|
| **JOSHRIX Explorer** | **£0** | 2,000 starter ACUs (one per verified email) | own config |
| **JOSHRIX Creator** | **£19/mo** | 380 ACUs ≈ **11 complete 2D games/month** | own config |
| **JOSHRIX Creator Pro** | **£49/mo** | 980 ACUs ≈ 30 games/month, 20% commission | own config |
| Rosebud AI Free | $0 | 20 prompts **per week** | [ToolFi](https://www.toolfi.ai/pricing/rosebud), [Rosebud FAQ](https://lab.rosebud.ai/blog/pricing-subscription-faqs) |
| Rosebud AI Pro | ~$19–19.99/mo | Commercial rights, **0% commission on sales** | [Summer Engine](https://www.summerengine.com/blog/rosebud-ai-pricing) |
| Buildbox Beginner | $14.99/mo | No-code editor; higher tiers $199.99–574.99/yr | [TrustRadius](https://www.trustradius.com/products/buildbox/pricing), [GameDesignSkills](https://gamedesignskills.com/game-development/buildbox/) |
| Lovable Pro | $25/mo | 100 message credits/month | [NxCode](https://www.nxcode.io/resources/news/bolt-new-vs-lovable-2026) |
| Bolt.new Pro | $20–25/mo | ~10M tokens/month with rollover | [No Code MBA](https://www.nocode.mba/articles/bolt-pricing-2026) |

**Read:** our entry subscription sits *at* the market rate (£19 vs $19–25). We
do not win on sticker price and should not try to.

---

## 3. Price comparison — what one game actually costs

This is where the model differs, and it is our strongest number.

| Platform | Cost of one finished game | Notes |
|---|---|---|
| **JOSHRIX (metered)** | **£0.32** (2D) / **£0.49** (3D) | Pay only for compute used; unused hold refunds instantly |
| **JOSHRIX enhance pass** | **£0.48** | Stack unlimited passes to raise quality |
| **JOSHRIX growth tool** | **£0.05** | Social posts, adverts, hashtags, scripts |
| Rosebud Free | "20 prompts/week" | A prompt is not a game; iteration consumes the quota |
| Lovable Pro | $25 ÷ 100 credits = **$0.25/credit** | A working app takes many credits |
| Bolt.new Pro | Token-metered | Comparable model; not games-specific |
| Buildbox | Subscription only | You supply the design labour |

**The structural difference:** competitors sell *access to a quota*. We sell
*the compute a specific job consumed*, at a transparent multiple. A creator who
makes two games in a month pays us about £0.64 of compute, not a £19 quota they
did not use — and a creator who makes fifty is not throttled at 20 prompts.

---

## 4. Price comparison — the take rate (this decides creator income)

| Platform | Platform keeps | Creator keeps | Source |
|---|---|---|---|
| **Roblox** | **~75%** | **~24.5%** effective, after marketplace fee, platform fee and DevEx conversion | [RoLearn](https://rolearn.dev/insights/roblox-developer-revenue-share-2026/), [Roblox Newsroom](https://about.roblox.com/newsroom/2026/04/roblox-fuels-high-fidelity-games-over-18-players-increases-qualifying-devex-rate-42) |
| Steam | 30% (25% after $10M, 20% after $50M) | 70% | [Immutable](https://www.immutable.com/guides/how-much-does-steam-take), [Fungies](https://fungies.io/steam-revenue-share-explained/) |
| Apple App Store | 30%, or 15% under $1M/yr | 70–85% | [Promise Legal](https://blog.promise.legal/game-platform-distribution-agreements/) |
| **JOSHRIX Creator** | **25%** | **75%** | own config |
| **JOSHRIX Creator Pro** | **20%** | **80%** | own config |
| **JOSHRIX Studio** | **15%** | **85%** | own config |
| **JOSHRIX Business** | **10%** | **90%** | own config |
| **JOSHRIX Enterprise** | **7.5%** | **92.5%** | own config |
| itch.io | 10% default, creator-adjustable 0–100% | up to 100% | [Generalist Programmer](https://generalistprogrammer.com/tutorials/itchio-vs-steam-indie-game-platform-comparison) |
| Rosebud AI | **0%** | 100% | [Summer Engine](https://www.summerengine.com/blog/rosebud-ai-pricing) |

**Read honestly:** we beat Steam, Apple and — by a wide margin — Roblox. We are
beaten by itch.io and Rosebud, both of which take little or nothing.

**But the comparison is incomplete on both sides.** itch.io and Rosebud take
less because they give you no audience and no distribution: you arrive with a
game and a marketing problem. Roblox takes ~75% *because* it hands you 80M+
daily users. We sit deliberately between those poles — a lower take than the
audience platforms, a real audience and toolchain unlike the zero-fee ones.

---

## 5. Feature map — what we have that they do not

| Capability | JOSHRIX | Rosebud | Buildbox | Lovable/Bolt | Roblox |
|---|---|---|---|---|---|
| Prompt → playable game | ✅ | ✅ | ❌ (manual editor) | ⚠️ apps, not games | ❌ |
| **Any language input** | ✅ | ⚠️ English-first | ❌ | ⚠️ | ❌ |
| **Metered pay-per-use** | ✅ | ❌ quota | ❌ subscription | ⚠️ credits/tokens | n/a |
| **Auto-refund on failure** | ✅ | ❌ | n/a | ❌ | n/a |
| **Multi-provider AI failover** | ✅ 3 providers | unknown | n/a | ❌ single | n/a |
| **Guaranteed-playable fallback** | ✅ engine build | ❌ | n/a | ❌ | n/a |
| Human moderation before publish | ✅ | ⚠️ | n/a | ❌ | ✅ |
| Built-in marketplace | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Remix lineage + ancestor royalties** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **AI Growth Engine** (10 tools) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SEO autopilot + per-game indexed pages** | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mobile-money / non-card payouts | ✅ | ❌ | ❌ | ❌ | ❌ |
| Own the IP outright | ✅ | ✅ | ✅ | ✅ | ⚠️ platform-bound |

**Genuinely differentiated (nobody else in this list has these):** remix
lineage with automatic ancestor royalties · the marketing Growth Engine ·
SEO autopilot with an indexable page per published game · mobile-money payout
rails · a metered model that refunds what a build did not use.

---

## 6. Value added to the creator, in money

**Scenario A — a hobbyist making 3 games a month.**
JOSHRIX: 3 × £0.32 ≈ **£0.96**, no subscription needed (Explorer's free 2,000
ACUs cover ~60 games). Rosebud Free: 20 prompts/week is likely enough. Lovable:
$25/mo whether you build one or ten. **Advantage: JOSHRIX, decisively, at the
low end.**

**Scenario B — a serious creator making 30 games a month and selling them.**
JOSHRIX Creator Pro: £49 + ~£10 compute ≈ **£59**, keeps **80%** of sales.
Rosebud Pro: ~$19, keeps 100% — but must find every buyer alone.
Steam: $100 per title + 30% forever.
On a £500 sales month: JOSHRIX nets the creator £400 minus £59 = **£341**;
Rosebud nets £500 minus £15 ≈ £485 *if* they can sell it; Steam nets £350 minus
listing fees. **Rosebud wins on take, we win on the odds of a sale happening.**

**Scenario C — an African creator taking payouts.**
JOSHRIX: mobile-money and BitriPay rails, £10 minimum. Steam, Apple and Rosebud:
card/bank rails that many of these creators cannot use at all.
**Advantage: JOSHRIX — for this creator, the others are not options.**

---

## 7. Where we are weak, stated plainly

1. **No audience yet.** Roblox's take rate is defensible because of its user
   base; ours is not yet. Until the Arcade has traffic, a creator is better off
   on itch.io economically.
2. **Rosebud's 0% commission is a sharper headline than our 25%.** We must
   justify the difference with distribution, marketing tools and payouts — or
   lose price-sensitive creators.
3. **Game quality is unproven** against Rosebud's, which has been in market
   longer. This is the single biggest commercial risk and no pricing page fixes
   it.
4. **Payouts cannot execute yet** (Stripe Connect not onboarded), so Scenario B
   and C advantages are promises until that lands.

---

## 8. Recommended positioning

**Do not compete on subscription price.** £19 is the market rate; a race to the
bottom against a funded competitor is unwinnable.

**Lead with the three claims that are true and unmatched:**

1. **"Pay for the game, not the subscription."** £0.32 per finished game, and
   we refund what your build did not use. No competitor refunds anything.
2. **"Describe it in your language."** Real multilingual creation, which the
   English-first market ignores.
3. **"We help you sell it."** Growth Engine, SEO autopilot, an indexed page per
   game, marketplace and mobile-money payouts. Rosebud gives you a file;
   we give you a business.

**And be upfront about the 25%.** Frame it as *"a quarter, versus Roblox's
three quarters"* — that comparison is favourable, verifiable, and the one your
buyer already understands.
