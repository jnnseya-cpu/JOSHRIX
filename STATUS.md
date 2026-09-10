# Where the platform actually is

One file, kept current. Read this before asking or answering "what's the state of X" —
holding this in conversation is what causes the same ground to be covered twice.

Last updated: 2026-09-10 (shared game links now unfurl as the game — the last half of the sharing work)

---

## SHARED GAME LINKS UNFURL AS THE GAME — 10 Sep

I closed the 6 Sep sharing work by saying game links "now unfurl properly". That
was an overstatement and Justin caught it: `play.html` had been given the
GENERIC site card, not the game's own. A link to someone's game still arrived
saying "Play a game forged on JOSHRIX Studio" with the house image — better than
naked text, and not what was claimed.

`/play/:id` rewrote straight to the static `frontend/play.html`, which sets
`document.title` in JavaScript and nothing else. **Unfurlers do not run
JavaScript.** So the strongest organic asset the platform has — a stranger
sharing a game — was the weakest card on the site.

**`api/play-html.ts`** now serves that route. It reads the real `play.html`,
splices the game's own card into the existing `seo-head` marker block, and
replaces the title and description. One shell, not two: duplicating the page
would have created a second copy to keep in sync, and `tests/t41` asserts the
markers still exist.

**The paywall is untouched, and that was the design constraint.**
`api/game-html.ts` remains the only thing that decides who receives a game's
bytes, and this route never calls it. `getGame()` defaults to `withHtml=false`,
so the query cannot return the game even by accident — `t41` proves it by making
the fake database record whether the `html` column was ever requested, and by
asserting a sentinel string never appears in any response.

**An unapproved game reveals nothing.** Pending and rejected games get the
generic card plus `noindex`: a creator's unreleased title is not public, and a
crawler must not index a URL whose game may never go live. A shared link only
ever exposes what `/api/arcade` already publishes to anyone.

**Every failure path is the old behaviour.** No shell, no database, a malformed
id — the page still serves and the game still plays. A card is worth having; it
is not worth a game being unplayable.

Also fixed while in there: `gameJsonLd` declared `price: "0"` for **every** game,
including priced ones — a structured-data claim contradicted by the checkout the
buyer then hits. It reflects `price_minor` now, and carries the play count as an
`InteractionCounter`.

`tests/t41-game-cards.js` (38).

---

## THE BLOG IS MEASURED NOW — 10 Sep

Justin asked for a blog that scores 90+ and is built to be found by search
engines and by answer engines. "SEO optimised" was asserted in the header of
`api/blog-html.ts` and measured nowhere, so the first move was to make the claim
a number.

### The score

`api/_seoscore.ts` scores a page out of 100 across five weighted groups: title
and meta (15), content depth (25), linking (20), structured data (20), sharing
(10) and technical/answer-engine (10). It runs in two places, from one
implementation so they can never disagree:

- **`scoreArticleDraft()` gates publication.** `blog-agent.ts` scores the draft,
  hands the shortfalls back to the writer for ONE rewrite, and **refuses to
  publish under 90**. It judges only what the writer controls, renormalised to
  100 — crediting the template would hand every draft the same free points and
  make the floor meaningless.
- **`scorePage()` judges the finished document.** `tests/t40` drives the REAL
  renderer against a stubbed database and scores the HTML that comes out.
  **Currently 100/100, grade A.**

What the score cannot do is promise a ranking, and it does not claim to. Position
depends on competition, domain authority, links from other sites and time. What
it measures is the controllable half.

### What was actually broken

- **Every blog share rendered as a grey box.** The card declared
  `summary_large_image` and supplied a **512x512 app icon**. A square image in a
  landscape card is the single most common way a share silently fails.
- **Every internal link pointed at the .html spelling**, which `cleanUrls`
  308-redirects — in the auto-linker table the whole interlinking strategy runs
  through.
- **The auto-linker could link inside a link it had just written**, producing
  `<a href="/blog/<a href="/ip-registry">remix</a>-economy">`: a nested anchor
  inside an attribute. It only appeared once the target list was broad enough for
  two rules to overlap on one sentence. Anchors are now frozen the moment they
  are inserted.
- **Post-to-post links almost never placed.** A sibling was linked only if the
  article quoted its whole headline verbatim. Widening it to a run of significant
  words did not work either — "browser game beats a download" has a stopword
  inside the run. Fuzzy-matching headlines against prose is the wrong tool, so
  there is now a **Related reading block ranked by keyword overlap, rendered
  inside `<article>`** where the links count as body content.
- The dead starfield canvas and the old palette tokens were still in the blog
  template.

### What was added

- **A per-post answer block.** The article's own opening paragraph is promoted
  into a marked block that `speakable` points at — the passage an answer engine
  lifts and cites. It does not invent one; a post that buries its answer still
  reads honestly, it just scores and cites worse.
- **A generated table of contents**, with a stable id on every `<h2>`/`<h3>`, so
  a page can be cited at a specific claim rather than only as a whole.
- **`BlogPosting` instead of bare `Article`**, a named author entity
  (`#editorial`) rather than the company, a real `dateModified`, and a 1200x630
  article image.
- **Visible breadcrumb, prev/next, byline, updated date.**
- **`/llms.txt`** (`api/llms.ts`, routed in `vercel.json`, announced in
  `robots.txt`) — a plain-text brief for answer engines: what the platform is,
  what is verifiably true, what it does NOT do, and which URL answers which
  question. **Every figure is generated** from `_features.ts`, `payments.ts` and
  the database at request time, so an engine cannot quote a stale number.
- 37 auto-link targets, up from 12, written to match how an article actually
  phrases a thing rather than the label the product uses. A representative post
  now carries **26 links in its body**.
- The writer's instructions state the scoring rules explicitly, because the agent
  is judged on them.

`tests/t40-blog-seo.js` (50) and the updated `tests/t12-seo.js` (50) cover it.

---

## THE PUBLIC-SURFACE AUDIT — 6 Sep

Every marketing page, its metadata, the sitemap, the press kit and the emails,
read against what the platform actually does.

### The whole site was unshareable

Of 32 pages, **exactly two carried a canonical URL and ZERO carried a single
Open Graph tag.** Every link pasted into WhatsApp, Discord, X, LinkedIn or Slack
unfurled as bare blue text — no title, no description, no image. The three
reference games had full cards; the entire marketing site had none.

index.html argues that JOSHRIX wins "the queue, the group chat, the fanbase
drop". The shared link IS the acquisition strategy, and it was the one surface
with no design on it at all.

- `tools/make-og-image.mjs` renders `assets/og-cover.png` (1200x630, 97KB) by
  composing the existing hero cast, so the card shows six real library models.
  PNG rather than WebP: X and LinkedIn still refuse WebP as an og:image.
- `tools/seo-head.mjs` writes canonical + og + twitter into all 33 pages between
  markers, so re-running replaces its own block instead of stacking a second.
- Canonicals are **extensionless**, matching what `cleanUrls` serves and what the
  games already declared. The two pages that DID have canonicals pointed at the
  `.html` spelling, which 308-redirects — they were naming the redirect as the
  real page. Both were replaced; two conflicting canonicals is worse than none.
- `play.html` and `doc.html` deliberately get NO canonical: one file serves many
  URLs (`/play/:id`, `doc.html?d=<SPEC>`) and a static canonical would declare
  every game, or every spec, to be the same page.
- `dashboard`, `profile`, `wallet`, `login` and `admin` are now `noindex,follow`.

`tests/t39-share-cards.js` (409) guards all of it, including that the image is
1200x630, absolute, PNG and under 900KB.

### Three public pages were missing from the sitemap

`growth`, `signup` and `studio`. `/growth` even carried its own canonical, so it
was meant to be indexed and was simply never listed. The sitemap also listed
every marketing URL in the `.html` spelling, so each entry redirected to the URL
we actually wanted indexed — crawl budget spent to arrive where it could have
started. Aligned to the canonical form.

### Copy that had stopped being true

- **`play3d.html`** told visitors *"Games created in the Studio today ship as
  polished 2D HTML5 builds"* and described 3D as something games "will be able to
  target as the REALISM-PIPELINE rolls out". The 3D lane shipped: `_engine3d.ts`,
  the hosted runtime, three reference games and a 2,591-model library. The page
  was actively underselling the flagship capability. Its `<title>` was also
  "Penalty King 3D" — a name this file records as invented data in the wallet
  incident — while its own h1 said "3D Engine". Corrected, and it is **orphaned**:
  no page links to it. Worth linking or deleting; it is a genuine working demo.
- **`studio.html`** was titled "JOSHRIX Forge Studio — Prototype" — the main
  product page calling itself a prototype in the browser tab and in search
  results — and its description promised publishing "to web, PWA, Android and
  iOS". The store lanes are a paid manual service, described honestly further
  down the same page; the meta turned them into a capability of the forge.
- **`dashboard.html`** advertised "forges, revenue, ACUs, games, and AI
  recommendations". The dashboard contains My Games.
- **The press kit** sent journalists to a GitHub blob **on this working branch**
  for the brand guidelines. That link dies the moment the branch is merged, and
  the same file is already deployed at `/branding/BRANDING.md`. Repointed, and
  the new social card added as a download.
- Nine meta descriptions were too short to fill a search result (login 26 chars,
  play 38, careers 45, showcase 51). Rewritten.

### Checked and found clean

Library numbers on every public page match `_features.ts` · no broken internal
links (all ten flagged were JS template concatenations) · © 2026 correct ·
`BRANDING.md` matches the shipped palette · the email catalogue carries no stale
claims, and `payout.paid` — "{{amount}} is on its way to you" — fires only when
an operator marks it paid, which is after the money has actually been sent.

### Still open: shared GAME links unfurl blank

`/play/:id` rewrites to `play.html`, which sets `document.title` in JavaScript
and nothing else. **Link unfurlers do not run JavaScript**, so every shared game
— the strongest organic asset the platform has — unfurls with no title and no
image. `play.html` now carries a generic JOSHRIX card, which is a strict
improvement over nothing, but a per-game card needs `/play/:id` served by a route
that renders og tags server-side. That path is `api/game-html.ts`, which is the
paywall, so it was not changed on my own judgement. It is the highest-value SEO
work left and it should be done deliberately.

---

## THE LAUNCH-READINESS DIVE — 6 Sep

Justin: *"why we still can't take the market by storm"*. Everything below was
traced in code, not inferred. What could be fixed from this environment was
fixed in the same pass; what needs his accounts is named as such.

### Fixed — 156 models the forge could not see

`packs/quaternius-fbx` — 156 models, 103 animated, and the library's ONLY sea
life (40), dinosaurs (6), and dock/fishing props — was ingested on 31 Aug,
written to `manifest.json`, deployed, and counted in the "2,591 models included"
the landing page advertises. **The build prompt never named it.** The Code Agent
can only write a path it has been given, so none of those models could appear in
any forged game. Nothing failed; no test went red; the library count stayed true.
Same shape as the eight packs that vanished into `.gitignore` in August — an
asset pipeline succeeding silently while the thing downstream never learns the
asset exists. `check-incoming.mjs` closed the upload end; this closes the
consumption end.

The pack breaks BOTH conventions the prompt teaches, so the entry says so twice:

- **Clip names are lowercase** here (`idle`, `walk`, `run`) where every other
  Quaternius pack uses `Idle`/`Walk`/`Death`. Following the general rule leaves
  the character frozen.
- **Every model is normalised to 1.85 units tall**, whatever it is — the FBX
  ingest applies `TARGET_HEIGHT = 1.85` to the Y extent, which is right for the
  characters it was written for and wrong for an avocado. A raw load makes fruit
  the size of a horse; `G.load(key, path, { height })` corrects it.

Both claims are asserted against the shipped files, not just written down: a
warning about a quirk that no longer exists is its own kind of lie.

**The LIBRARY 4 header was also stale in all three of its numbers** — it claimed
152 models in 9 packs with 150 animated; the manifest held 162 in 10 with 156,
and now 318 in 11 with 259. Wrong in the direction that undersells the library
to the model writing the game.

`tests/t38-prompt-library.js` (49) now fails if any pack on disk is missing from
the prompt, if any name the prompt lists does not resolve to a file, or if the
LIBRARY 3/4 headline counts drift from the manifest.

### Fixed — /api/health reported "live" off the wrong key

`mode` was `ANTHROPIC_API_KEY ? "live" : "demo"`. Anthropic is the **last**
provider in the chain, placed there on measured truncation. So a deployment
holding only `GEMINI_API_KEY` — the one provider the probe says returns a
complete full-size build — reported "demo" and looked broken, while one holding
only `ANTHROPIC_API_KEY` reported "live" and would fall through to the engine on
most runs. Health now reports `forge.leadProvider`, `forge.fallbacks` and
`forge.ready`, so a single-vendor deployment is visible as such.

### Fixed — .env.example was a wish list

Twenty variables no code reads (BitriPay, SendGrid, Twilio, Vertex, Skybox, a
JWT signing key), while **omitting `PAYOUT_SECRET`** — without which
`api/_secrets.ts` fails closed, `/api/payout-destination` refuses to save a
destination, and therefore **no creator can request a withdrawal at all**.
Provisioning from that file meant buying accounts the platform cannot use and
still shipping a wallet nobody could cash out. Rewritten as a contract: required
/ required-before-payouts / recommended / reporting-only / not-implemented.
`tests/t32-secrets.js` now fails if a declared name is read by nothing, or a name
the code reads is undocumented.

Worth keeping in view: `IMAGE_GEN_API_KEY`, `MESHY_API_KEY`, `TRIPO_API_KEY` and
`ELEVENLABS_API_KEY` are read in exactly one place — `providerStatus()` — and
reported as booleans on `/api/health`. **No code path calls any of those
services.** `docs/REALISM-PIPELINE.md` is a specification, not an implementation.

### Fixed — the wallet showed an ETA it could not keep

`/api/payout` returns a careful note: *"Reserved and queued for operator release.
Funds move once the payout rail is executed."* `wallet.html` dropped it and
rendered `✓ requested … ETA 1 day(s)`, which a creator reads as money on its way.
The note is now shown, and the ETA is labelled as the rail's time **after**
release. The rails themselves stay: the fee mathematics is real and Justin does
execute them — selling a manual service is honest, implying an automated one is
not.

### NOT fixable here — these need Justin's accounts

| Blocker | Why it matters | What it needs |
|---|---|---|
| **The loop has never closed once** | The forge has never produced a game Justin judged good, and until 2 Sep no 3D build could be published even if it had. Nobody has gone concept → game → published → sold → paid. This is the whole product. | One forge run. Check `/api/health` first: if `forge.leadProvider` is not `gemini`, set `GEMINI_API_KEY`. |
| **Money cannot leave the building** | `/api/payout` queues; an operator moves money by hand and marks it paid. No Stripe Connect, no BitriPay integration despite the name appearing in customer copy. Caps the platform at the number of creators Justin can personally pay. | Stripe Connect onboarding (and a mobile-money aggregator if the Africa promise is to be real). Both need building, not just a key. |
| **No tax collection** | Zero `automatic_tax` / `tax_behavior` on any Stripe session. Digital goods to UK/EU consumers carry VAT obligations; the EU has no threshold for non-established sellers. | Stripe Tax is a config change plus registration. Get an accountant's read before volume. |
| **No error monitoring** | No Sentry, no Datadog. A forge that fails for a paying creator at 2am surfaces when they email. `/api/forge-log` is pull, not push. | A monitoring account. Free tier is ample at this volume. |
| **Route 3 of the business model** | Publish to the creator's own Play/App Store — specified in `PLATFORM.md`, sold by hand via `/api/distribution`, not built. | Real work, but nothing in the architecture blocks it. |

**Corrected while here:** the P0 section below said `wallet.html` still sends a
hardcoded `destinationRef: 'tok_demo_dest_2941'`. That was fixed —
`api/payout-destination.ts` owns tokenised destinations and `/api/payout` reads
the saved one. The entry was stale.

---

## P1 — NO 3D GAME COULD EVER BE PUBLISHED. Closed 2 Sep.

The arcade has been empty since launch, and Featured Worlds on the landing page
renders "No public worlds yet". The cause was not a lack of creators.

`POST /api/games` gated on `html.includes("<canvas")`. A build on the hosted
JOSHRIX3D runtime contains no literal `<canvas>` anywhere — the runtime creates
the element from JavaScript, which is the point of a hosted runtime. So every 3D
game, the platform's flagship output and the thing the whole landing page
advertises, was refused at publish with "`html` must be a complete forged game
(doctype + canvas)" — a message that reads as though the creator's game is
malformed.

`api/_gateway.ts` already knew this. `looksPlayable()` exists, and carries the
comment "3D builds create their canvas from JavaScript and used to be silently
rejected here". `api/forge-game.ts` was moved onto it; the publish endpoint was
not, so the two halves of one pipeline disagreed about what a game is.

**Fixed:** `api/games.ts` uses `looksPlayable()`. The gate widened to fit 3D
rather than disappearing — a prose document, a bare fragment, and a page that
loads the runtime without booting it are all still refused.

**A second bug behind it.** Even with an approved game in the database, the
Featured Worlds cards would not have appeared: they are created with class
`reveal`, and the IntersectionObserver that turns `.reveal` into `.in` runs once
at load, before the `/api/arcade` fetch resolves. Cards created afterwards were
never observed and stayed at `opacity:0`. Invisible until there were games to
make it visible.

**Verified end to end by `tests/t37-publish-3d.js`** — real handlers, real engine
output, forge → publish → moderate → arcade, 19 assertions. It drives the actual
`buildPlayable3dGame()` output rather than a fixture, because a hand-written
fixture would have contained a `<canvas>` and agreed with the bug.

**Still outstanding: the arcade is still empty.** The pipeline works; nobody has
run ten forges through it. `tools/seed-arcade.mjs` does exactly that against a
live deployment — ten launch-title concepts in five languages, forged, published
and approved through the real endpoints, with a preflight that refuses to start
if no provider key is live. It needs `ANTHROPIC_API_KEY` in Vercel, a funded
(tester-designated) wallet, and `MODERATION_KEY`. None of those exist in a dev
container, so this environment cannot run it.

---

## P0 — ANYONE COULD TAKE ANY ACCOUNT WITH AN EMAIL ADDRESS. Closed 28 Aug.

Found during the launch audit, while mapping a lesser finding. It was live.

```
POST /api/wallet-init  {"email":"victim@example.com"}
→ {"walletId":"w-…","balance":9000,"category":"purchased","plan":"studio"}
```

No password, no token, no proof of ownership. `wallet-init` looked the address up
and **handed back the walletId** — which was the bearer secret for the entire
account. Three things made it worse than it reads:

- The human-verification check sat *below* that lookup. It only ever guarded
  creating a NEW wallet, so the takeover path never reached it.
- `normalizeEmail` collapses `+tags` and gmail dots, so it *widened* the match.
- `POST /api/payout` takes the wallet to debit **and the destination to pay**
  from the same body. Knowing an email address was enough to send a creator's
  earnings to your own account.

**The fix: a Firebase ID token is now the credential; walletId is a database key
that proves nothing.** The frontend had exposed `jxAuth.idToken()` since it was
written — `grep -rln firebase api/` returned nothing, so the backend simply never
asked. `api/_auth.ts` verifies the token against Google's certs with `node:crypto`
(no new dependency: firebase-admin would pull a large tree into every function to
do the same four checks).

Wallets bind to the Firebase **uid**, not the email — an address can be
reassigned, a uid cannot. The migration runs itself: a legacy wallet binds on its
owner's first verified sign-in, and once bound a second account cannot claim it.

| Where | Now |
|---|---|
| `wallet-init` email → wallet | Requires a verified token. Unauthenticated → **401**, logged as `wallet_claim_unverified` |
| `wallet-init` delete | Bound wallets need their owner |
| `payout` | Token required, and the wallet's owner must match the caller |
| anonymous wallet creation | **Unchanged** — the signed-out funnel still works |

**What this deliberately breaks.** Reaching an existing wallet now requires
signing in. If Firebase is down or a user cannot sign in, they cannot reach their
wallet on a new device. That is the trade Justin approved (option A): the hole
shuts immediately, at the cost of a page refresh for anyone on a stale cached
page. There is no email fallback, because the email fallback *was* the hole.

`tests/t33-auth.js` (40) drives the real endpoint with nothing but the victim's
address and asserts the refusal — verified red against the old code, where it
returned the wallet. It also covers `alg:none`, tampered signatures, a token from
another Firebase project, expiry, and future-dated tokens. `tests/_authstub.js`
mints tokens with a local RSA key so the signature check is real.

**Still open from this finding:** `?w=<walletId>` remains in preview URLs
(`api/games.ts`) and in `game-html` / `forge-result` / `growth-analytics`. It is
no longer a credential for the *account*, but it still grants access to a game,
so it should move to the token too. ~~Also: `wallet.html`'s payout button sends a hardcoded
`destinationRef: 'tok_demo_dest_2941'`~~ — **fixed.** `api/payout-destination.ts`
stores tokenised destinations encrypted under `PAYOUT_SECRET` and `/api/payout`
reads the saved one; a raw ref from the request body is no longer accepted. The
operator queue at `/admin` is still the only thing that moves money, because
there is no payout rail integration at all.

---

## THE MONEY LEAKS — audited and closed, 25 Aug

Justin: *"cancel all possible gaps, leaks, scenario, frauds, loopholes and everything else
that will cause a loss."* Twelve were found. All twelve were live. Each now has a test that
fails against the old code — verified by reverting the fix and watching the test go red.

| # | The exploit | Where it was | Closed by |
|---|---|---|---|
| 1 | **Every paid game played free** at its public URL | `game-html.ts` served html for any approved game; `hasEntitlement()` existed and was called by nothing | entitlement gate on the play route |
| 2 | **Forge → refund → publish = free game**, repeatable | `games.ts` saved first and settled "best-effort" after; `/api/forge-refund` is client-asserted | settle BEFORE save; a refunded build is re-collected or the publish is refused |
| 3 | **One month of Studio bought 15% forever** | `seller_plan` frozen on the games row at listing time, read at settlement | commission read from the plan held at the moment of sale |
| 4 | **Getting the plan wrong was cheaper than getting it right** | `?? "creator_pro"` (20%) in three files, under Creator's 25% | fallback is the dearest rate, derived from `PLANS` |
| 5 | **A lapsed subscription never ended** | only `customer.subscription.deleted` handled; Stripe's "mark unpaid" dunning never deletes | `customer.subscription.updated` withdraws the plan |
| 6 | **A refund left both sides paid** — buyer kept the game, seller kept the money | `charge.refunded` clawed back ACUs only | entitlements carry the payment intent; both sides reverse |
| 7 | **Same-day cash-out on a stolen card** | nothing blocked self-purchase; earnings were withdrawable instantly | self-purchase refused; earnings clear for `EARNINGS_CLEARING_DAYS` |
| 8 | **Unapproved builds previewed for strangers** | `!game.creator_wallet \|\|` in the preview check | ownership or moderation, no third case |
| 9 | **Free unlimited AI whenever the database blinked** | `if (sql) { ...debit... }` in all four paid endpoints | `ledgerRequired()` — paid AI fails closed |
| 10 | **A 100%-off coupon or a free trial granted full ACUs** | grants keyed to session metadata, not to the money | `grantCheck()` refuses a £0 settlement, honours real discounts |
| 11 | **A plan changed in Stripe kept renewing at the old tier's ACUs** | subscription metadata is stamped at creation, never updated | the invoice amount identifies the plan; drift corrects the wallet |
| 12 | **Paid withdrawals stayed `reserved` forever** | marking a payout paid updated only the request row | `settleReservation()` |

**On the loophole Justin raised himself** — *"what if someone stops renewing and only tops
up instead?"* That was #3, and it was real. It is now the reverse: the ACU price is the same
either way (top-up is in fact **5× cheaper per ACU** than a plan), so the *only* thing a
subscription buys is the commission rate — and that now stops the moment they stop paying.
Cancelling costs them 25% instead of 15%. There is no longer an arbitrage.

**Residual risk, accepted deliberately — Justin, 25 Aug: "keep both as they are."**
`EARNINGS_CLEARING_DAYS` is **14**. UK card disputes can be raised up to 120 days out, so a
patient fraudster can still outrun it; what 14 days stops is the same-day cash-out, which is
the version that gets automated. Holding creator money for four months to catch the slow tail
would cost more in creator trust than the tail is likely to cost in fraud. This is a judged
trade-off, not an oversight. It is one constant, read in one place, if real dispute data ever
says otherwise.

**Free play: settled, and not a leak.** An unpriced game still plays for anyone; a priced one
requires an entitlement. The creator chooses by pricing it or not. An unpriced play spends no
provider money — the forge was already paid for — so this is a funnel decision, and Justin
made it. Full reasoning in the next section.

`tests/t29-leaks.js` (61) covers the ledger primitives, `tests/t30-paywall.js` (34) drives
the real handlers. Suite: **32 files, 845 assertions, green.**

---

## NOTHING IS FREE — Justin, 22 Aug

> No one can build, create, sell or play for free, on any platform.

This EXTENDS the standing "no free AI" rule to **playing**. It is coherent with the model
below: if creators sell games in the marketplace, an arcade that gives the same games away
is competing with the creators it is meant to pay. GO-TO-MARKET §2.2 already named the
same failure in the creation lane — "the free tier destroys the paid tier".

**One outright falsehood, fixed 22 Aug.** `index.html` told every visitor "Forge yours —
the first one is free". A public signup gets **zero ACUs**; a 2D forge holds 150 and a 3D
forge holds 250. Anyone who clicked it was refused. It now reads "creation starts from a
£5 ACU pack", which is what `pricing.html` already said and what the code actually does.

**What still contradicts the rule, and is NOT yet changed** — because paywalling play is
outward-facing, hard to reverse, and Justin's call, not mine:

| Where | What it says or does |
|---|---|
| `shared/payments.ts` | `explorer` plan, £0/month, "browse & play only" |
| `arcade.html` | "playable instantly, **free**, no account, no download" |
| `index.html` | "Play One Now — **No Account**" · "no payment — it runs in this page" |
| `pricing.html` | "JOSHRIX Arcade · **Free**" |
| `play.html` / `/play/:id` | **partly closed 25 Aug** — a *priced* game now requires an entitlement; an *unpriced* one still plays for anyone |

**DECIDED — Justin, 25 Aug: "keep both as they are."** The question was put to him with the
leak audit, alongside the clearing window. His answer settles it:

> **A game the creator has PRICED requires an entitlement. A game with no price plays for
> anyone.** The creator decides which, by pricing it or not.

This is the second option below, generalised — the shop window is not a hand-picked list of
demos, it is every game its creator chose to leave open. It costs the platform nothing:
the forge was already paid for, so an unpriced play spends no provider money. It keeps the
GO-TO-MARKET press story ("a stranger plays a Nairobi student's game from a link"), keeps
`/api/seo` and the sitemap pointing at pages that actually play, and it protects creator
earnings, because the games that earn are exactly the games that are gated.

**So the arcade copy in the table above is now accurate, not a contradiction** — an arcade
of unpriced games IS free, and says so honestly. Do not "fix" it. The rule at the top of
this section governs *building, creating and selling*, and for *playing* it governs the
priced catalogue. That distinction is Justin's, made here, and is not to be re-derived.

The alternative he rejected, recorded so it is not re-proposed: **nothing free at all** —
every game requiring an account with credit. Cleanest read of the 22 Aug rule as literally
worded, and rejected because it closes the shop window the whole funnel depends on.

---

## THE BUSINESS MODEL — Justin's words, 22 Aug. Do not restate it any other way.

> Customers create games and sell them in our marketplace. It can be in our place,
> or on the user's own Android and iOS developer account.

Three distribution routes, and the third is **not built**:

| Route | State |
|---|---|
| Sell on the JOSHRIX marketplace | **Built** — `/api/listing`, `/api/checkout`, `/api/payout`, commission 7.5–25% by plan |
| Play free on the arcade / by link | **Built** |
| **Publish to the creator's OWN Play Store / App Store developer account** | **SPECIFIED, NOT BUILT** |

The third route is written into the specs already — `PLATFORM.md` §127 promises "generate an
Android package, prepare an iOS project", and `DATA-MODEL.md` carries
`target: "web" | "android" | "ios" | "desktop" | "source"` — but **nothing in `api/`
implements any of it.** Treat the specs as intent, not as a description of the code.

**Four false present-tense claims removed 22 Aug.** `arcade.html`, `pricing.html` and
`studio.html` all told visitors the Arcade shelf "ships inside the JOSHRIX Arcade apps on
Google Play and the App Store". There is no app project anywhere in this repo — no
Capacitor config, no TWA, no Xcode project, nothing in `api/` — so those apps do not
exist. `index.html` separately promised "single-click CDN deployment to every target
marketplace — Steam, app stores". All four now describe what actually happens: install to
the home screen, no store download. **If those store apps DO exist outside this repo, say
so and the lines go back** — they were removed on the evidence in the repository.

The three priced store lanes in `/studio` are NOT in that category and were left alone:
`/api/distribution` records a real request with status `queued`, takes no money, and the
copy describes a service fulfilled by hand. Selling a manual service is honest; claiming
an app exists is not.

Technically it is a wrapper job, not a rewrite: the games are self-contained HTML, so
Android is a Trusted Web Activity or a Capacitor shell, and iOS is a WKWebView project the
creator opens in Xcode under their own Apple account. It is real work — signing, icons,
store metadata, age ratings — but nothing about the current architecture blocks it.

**I described the product as "browser games, one HTML file" on 22 Aug and Justin corrected
me. That framing was mine, not his, and it made a distribution route sound like a ceiling.
The format is the advantage — no install for the player — and it does not preclude a
creator shipping the same game to their own store account.**

---

## The deploy was about to ship 736MB of dead weight — fixed 22 Aug

`vercel.json` sets `outputDirectory: "frontend"` and there was no `.vercelignore`,
so **every byte under `frontend/` was uploaded and served** — including
`frontend/assets/models3d/_incoming/`, the 736MB of raw `.gltf + .bin + png` the
suppliers ship, which the ingest had already packed losslessly into the `.glb`
files under `packs/`. No player ever fetches a byte of it. The deploy was **983MB,
of which 748MB was waste**; it is now ~235MB.

This was not cosmetic. A deploy that size is slow at best and refused at worst, and
a refused deploy means the model library silently never reaches the site: every game
the forge builds 404s on its characters and the creator is **charged for a build
that cannot run.** It appeared the moment the 22 Aug upload landed and would have
hit the first forge run after it.

The uploads stay in git — they are the source a re-ingest runs from and cannot be
re-downloaded from this environment (kenney.nl and quaternius.com are both blocked
by proxy policy) — so ignoring them at deploy time is the fix, not deleting them.

---

## What is actually in the asset library — settle this, stop re-deriving it

Both suppliers Justin paid for are **in the repo and shipping**. This section exists
because I got it wrong in conversation and cost him a round trip.

| Supplier | 3D | 2D sprites | Audio |
|---|---|---|---|
| **Kenney** | 22 kits, **2,119 models** — in since before this session | 6 packs, **2,553 sprites** — in | none |
| **Quaternius** | 9 packs, **152 rigged models**, 150 animated — landed 22 Aug | — | none |

**Corrected 31 Aug: this was wrong.** "Nothing further needs uploading" assumed
the 22 Aug upload was complete. It was not — 18 of the 28 Quaternius character
packs never made it (see the character-library section below), so the Quaternius
row above counts 9 packs out of a possible 27. Those 18 are the outstanding
upload. Kenney's static and sprite packs, and audio, remain settled.

---

## The runtime had no sound engine — closed 22 Aug, no assets needed

The entire audio surface was `G.beep(freq, dur, type, gain)`: one oscillator with a
decay. Meanwhile the build prompt asked every game for "procedural WebAudio sound
design: distinct SFX per event + ambient bed", so each build reinvented percussion
from scratch and mostly shipped thin or silent.

`G.sfx(name, { gain, pitch })` is now a **twenty-sound library** — click step pickup
coin powerup jump land thud hit hurt shoot laser explode spark whoosh splash door
alarm win lose — and `G.ambience(kind)` is **seven looping beds** (wind rain sea
forest night city hum). All of it is synthesis: one second of noise buffer through
filter envelopes, plus oscillators with pitch glides. **No files, no download, no
new dependency, nothing added to page weight.**

`gain` and `pitch` mean one preset covers a light hit and a heavy one, so twenty
names cover far more than twenty sounds. An unknown name falls back to `click`
rather than going silent, because a silent game reads as broken.

**This is additive API, NOT a fourth v1 exception.** No already-published game can
call a method that did not exist when it shipped, so none of them can change. That
is the line: additive is always safe on a pinned file, changed behaviour is not.

Wired all the way through, so it is not another complete thing with nothing calling
it: the runtime API list, the worked example (which now reads `g.sfx("coin")` and
`g.sfx("hurt")`), the 3D requirements — which now forbid hand-rolling an
AudioContext — and **the engine floor, which rejects a build where nothing the
player does makes a sound.**

`tests/t27-sound.mjs` (19 assertions) wraps every AudioContext factory before the
runtime boots and asserts on the graph that actually gets built — because every node
here is inside a try/catch by design, so a totally broken synth would return `this`
from every call and look healthy. It checks all twenty sounds start a source, that
impacts are noise-based and fanfares are pitched, that the bed loops and a second bed
replaces rather than stacks, and that mute silences a loop already playing.

**`G.say()` already covers voice** — real speech synthesis, defaulting to the page's
own language, so a game written in French speaks French unprompted. There was never a
voice pack to buy.

## The character library — landed 22 Aug

Justin uploaded the Quaternius character bundle he bought. Twenty packs arrived;
ten shipped glTF and were ingested, ten were 2017–2019 FBX/Blend-only and were
dropped by the `_incoming/` filter. **152 rigged models, 150 of them carrying full
skeletal clip sets**, in nine packs. The library is now 2,435 models / 34 packs,
and the count of animated models went from 22 to 178.

### Correction, 31 Aug — it was 28 packs, not 20

Photographs of the source drive show **28** folders in `Characters and Animals`.
Twenty reached git. **Eight never appeared at all**: every file in them matched
the `.gitignore`, and git cannot record a folder with no surviving files, so
they vanished with no error and nothing in `git status` to see. Combined with
the ten that arrived as a bare `Preview.png`, **18 of 28 packs are missing** and
it took nine days to notice, because nothing was checking.

Three things changed so this cannot recur:

- **`tools/check-incoming.mjs`** — asks `git check-ignore` itself, then prints
  one line per pack: files kept, files discarded, and whether what survives is a
  playable model or an orphaned preview. Exits non-zero if any pack would land
  unplayable, so it can gate a commit.
- **`_incoming/characters-fbx/` now keeps every model format**, not FBX alone.
  Guessing a pack's format wrong cost eight packs; uploading a duplicate costs
  some history. The ingest prefers glTF and skips the FBX beside it.
- **`resolveAsset()` in `tools/_assets.mjs`**, shared by the ingest and the
  checker so neither can drift. It found a defect in a pack that has looked
  complete since 22 Aug: `Universal Base Characters` has `.gltf` files asking
  for `T_Eye_Normal_png.png` while the pack ships `T_Eye_Normal.png` — the
  exporter appended `_png` to some names and not others, so 18 characters were
  404ing their eye and hair normals at play time. A texture that genuinely
  cannot be found now has its material slot detached rather than exported as a
  dangling `uri`.

### Landed 31 Aug — 17 of the 18, and the FBX path proven on real files

Justin pushed them (`12aba4ff`): **193 files, 94 MB, 152 models, every pack
complete** by `check-incoming`. Only `Farm Animals Animated - Jun 2018` did not
move — its folder name on disk differs from the one in the runbook, so the
`move` found nothing. It is still in `_incoming/characters/`.

`tools/ingest-characters.mjs` then ran its **FBX path on real files for the
first time** — the branch that could not be tested because the filter excluding
FBX was the reason no FBX had ever reached the repository. It found three real
defects, all now fixed:

- **Five animals were lost to `window is not defined`.** FBXLoader reads
  `window.innerWidth` to compute a camera's aspect ratio, and every FBX in the
  2016 Animals Pack ships a camera. `tools/gltf-export-polyfill.mjs` now
  supplies a minimal `window`; Chick, Fish, Red Fox, Whale and bird converted.
  147 → 152.
- **Clip names carried the rig's name.** Blender writes `Armature|Sitting`,
  Quaternius' zombie writes `Zombie|ZombieBite`. A game asks for a clip by
  name, so every one of those animations was unreachable. `clipName()` strips
  the prefix, and the vocabulary gained swim, fly, crawl, sit and pickup —
  clips these packs actually contain and had no name for.
- **Clips collided.** `animated_woman` arrived as
  `idle,jump,die,run,walk,idle,jump,…`; the loader returns whichever it saw
  first and the other is unreachable weight. `dedupeClips()` keeps the longest
  per name — the authored animation rather than a transition stub. That file is
  now `idle,jump,die,run,walk,sit,pickup,attack` and 180 KB smaller.

### Then: looking at them, which found four more

`validate-models.mjs` passed all 2,591 — and it was still wrong, because
**"loads" and "looks right" are different claims.** `tools/contact-sheet.mjs`
(new) renders a pack to a single labelled image on a mid-grey ground, and the
first sheet showed characters that had validated perfectly rendering as white
and black silhouettes.

- **Every one of the 159 lost its texture.** The lookup required the image to
  sit under the model's OWN folder, but Quaternius puts models in `<pack>/FBX/`
  and textures in `<pack>/Blends/`. It matched nothing, ever. The search now
  climbs to the pack — and stops there: climbing to the drop folder handed the
  Alien another pack's skin, and one level from `Old/` would put a fish texture
  on a cat.
- **Materials were rebuilt flat white**, discarding the only colour most of
  these models have. The robot, the men and the women carry no texture and no
  vertex colours, just a material colour each, and all exported as white ghosts.
- **`emissive` was dropped.** Quaternius exports these packs with emissive set
  equal to diffuse, so the fish, dragon and hairstyles rendered at half the
  light the artist saw.
- **A tie was stretched over a whole man.** `Animated Men Characters` ships one
  usable PNG — `Tie.png` — and "the pack's only image" was enough to make it a
  full-body skin. A texture must now be named for the model or name itself as a
  whole-body map.

Final: **2,591 models / 35 packs, 2,591 loaded 0 failed, animated 178 → 281.**
Ten models from the superseded 2016–17 `Old` packs are genuinely white in the
source FBX — white materials, no UVs, no vertex colours — so there is no colour
to recover.

15 new assertions in t17. The FBX branch is no longer "written but unproven".

Three things had to be fixed before any of it was usable, and each one would have
shipped silently:

**1. Two packs were 812MB.** Quaternius' "Standard" tier ships 4096px PNG normal
and ORM maps — one fantasy outfit was a **39MB GLB**, and 24 of them came to 738MB,
more than the rest of the library combined. `tools/shrink-textures.mjs` now
re-encodes embedded textures through Chromium's own canvas (no new dependency —
the browser was already installed for the validator), capping at 1024px and
converting to JPEG unless the alpha channel carries information. **738MB → 23MB
and 73MB → 6MB, every model still loading with skeleton and textures intact.**
It is idempotent, so it can be re-run over a pack safely.

**2. Forty modular fragments were about to enter the catalogue.** Those two packs
are modular: separate GLBs for arms, legs, boots, hair, pauldrons. The runtime has
no bone-attachment API, so a game asking for `male_ranger_legs` renders a pair of
floating trousers. Only the six assembled bodies were kept; the parts stay in
`_incoming/` and come back with a re-ingest if the runtime ever grows attachment.

**3. Forty-eight of the fifty-two main characters had black skin.** Quaternius'
Nov 2019 glTF export writes the `Skin` material as baseColorFactor
`0.013410447165369987` on all three channels — sRGB `#1F1F1F`. The exact same
constant in 48 files, while the four that differ are the goblins and zombies whose
green and grey skins came through correctly: an export fault, not art direction.
Faces and hands rendered black. `tools/ingest-characters.mjs` now repairs it on
the way in, using the skin tone the same artist ships in the 2022 Modular Men and
Modular Women packs — byte-identical across both, so the repaired 2019 cast
matches the rest of the library exactly. Verified by re-render in real Chromium.

**A fix that was investigated and deliberately NOT made.** The runtime never sets
`renderer.outputEncoding = sRGBEncoding`, so three r147 renders the whole platform
in linear space — textbook-wrong. Setting it was tested against Midnight Post:
the night delivery game came out looking like an overcast afternoon. The runtime's
sky gradients, fog and light intensities were all authored against its own
pipeline, so the "correct" change washes out every published game. **The pipeline
is internally consistent and stays as it is.** If it is ever revisited it belongs
in `joshrix3d-2.js` with the palettes re-tuned together, not as a one-line edit.

The forge catalogue in `_gateway.ts` now carries LIBRARY 4 with every pack's exact
filenames, measured heights and **exact clip names** — the Quaternius vocabulary is
`Idle`/`Walk`/`Run`, capitalised, not the `lib/` lowercase vocabulary, and asking
for a clip that does not exist leaves the character frozen. The old closing line
"CHARACTERS ARE SCARCE" is gone; it was the sentence steering every build away from
using people at all.

Nothing further is owed from Justin's side. Kenney's 3D kits and sprite packs were
already in the repo, and the audio gap was closed in code — see the two sections at
the top of this file.

---

## Go-to-market

`GO-TO-MARKET.md` is the launch plan: **Nairobi**, 18 Aug – 15 Nov 2026, £2,650 lean /
£6,100 with an agency. It is gated on the forge working — items 1 and 2 below.

## The 2D lane had no quality gate at all — fixed 20 Aug

Tracing "what happens if a user makes a 2D game" found that **every quality gate
in the gateway lived inside `if (is3d)`**. A 2D build faced the security scan and
then `looksPlayable()`, which returns true if the string `<canvas` appears
anywhere in the file. A 2,000-byte stub passed and shipped.

**A correction that matters.** The `/api/forge-selftest` numbers of 18 Aug —
gemini 35,973 bytes ok, openai 8,411 ok, claude truncated — were measured with
`GAME_SYSTEM`, the **2D** prompt, at 2D budgets. I used them to diagnose and
reorder the **3D** chain. The conclusion may still hold for 3D, but it was never
measured there; the lane those numbers actually describe is 2D, and 2D was left
leading with openai, the provider that returned a third of a game.

Now: `MIN_2D_BYTES = 12_000` (openai's measured 8,411 is ~250 lines against the
prompt's own 650-line minimum; gemini's complete build was three times the floor),
a `FLOOR_2D` of four things `GAME_SYSTEM` states outright — a render loop, a 2D
context, a path a finger can take, and sound — and one provider order for both
lanes, gemini first. Short builds are demoted to fallback, not discarded, so a
creator still gets the best of a bad run. 26 assertions in `tests/t14`.

**2D still has no runtime.** The model writes the loop, input, collision, HUD and
state machine from scratch every time — exactly the condition 3D was in before
9 Aug, which is when 3D output started being usable. The floor stops the worst
builds shipping; it does not make good ones. The 2D runtime port is the fix and
it is still open.

## A third reference game, and the first automated proof one is playable — 20 Aug

**`/games/midnight-post`** — drive the night post van through a sleeping village,
reach each lit doorstep before dawn, stay off the parked cars. Dispatch speaks the
address, so it also answers "some games need to talk". Built on the runtime: the
game file supplies the concept and nothing else.

It leads with a **vehicle rather than a character on purpose.** The character
library is ten blocky humans; a game whose hero is the weakest asset in the
library looks like the library. The cars and buildings are the best-looking things
we have, and a van never has to animate.

**`tests/t26-midnight-post.mjs` plays it.** Not "the file loads" — it presses
Start, holds the throttle, steers, drives all eight drops, and reads the parcel
count off the HUD. 21 assertions. This is the first thing on the platform that
can distinguish a game from an 8,411-byte stub without a human looking at it.

Writing that test found four real defects nothing else would have:

| Found by playing it | What it was |
|---|---|
| The van drove off on its own at the start | The pointer target was seeded with a sentinel, so frame one looked like a fresh touch |
| The van "barely moved" | Parked cars could spawn on top of it — a collision loop charging 6s every 1.2s that no input escapes |
| A crash could re-trigger forever | Nothing pushed the van clear of the car it hit |
| The world ended at a visible edge | The runtime's ground is a disc of radius `arena` but fog starts at `arena * 1.4`, so the rim always meets the sky unfogged. **Every game on this runtime has this.** Fixed here with a skirt the game lays itself, rather than changing a pinned v1 under already-published games |

Measured, not guessed: 349 meshes against WonderVerse's 193 and Dino Island's 262,
which is why the scenery is thin and concentrated at the rim. Frame rate in this
environment is 2.7fps at 1280x800 and 9.7fps at 640x400 for the *same scene* — it
is a software rasteriser with no GPU, so those numbers say nothing about a phone
and are not quoted as if they do.

Also closed while wiring it up: **WonderVerse was never in the sitemap and never on
the arcade shelf.** It shipped, the newsletter linked it, and search engines were
never told it existed. The arcade had one hardcoded card. `t12-seo` now fails if any
game in `frontend/games/` is missing from the sitemap, the newsletter or the arcade.

## The 20-day audit — 19 Aug

Seventy-seven commits reviewed against the code that actually shipped. What it
found was not half-written features; it was **finished work with nothing calling
it**, which is worse, because a test suite can pass over it forever.

**The marketplace was a dead limb.** `/api/checkout` was complete — Stripe
session, server-authoritative price, splits, webhook entitlement, creator
earnings credited, 11 passing assertions — and **no page called it**.
`setListingPrice()` sat in the ledger with **zero callers**, so no game ever had
a price, so checkout answered *"This world has no valid sale price set by its
creator"* for every game on the platform. `studio.html` told creators "You set
the price" next to a disabled button. Now: `POST /api/listing` sets or clears a
price (ownership enforced in the same UPDATE that performs it, commission read
from the wallet and never from the request), a **Price** column on the dashboard
quotes the split before saving, and `/marketplace` has a For Sale grid with a
Buy button. 39 server assertions + 19 in a real browser, including the negative
that matters: the Buy button transmits an id and never a price.

**Payouts could be requested but never paid.** `/api/admin-payouts` was complete
and `/admin` never called it — a creator could request a withdrawal nobody could
action. Worse, the ledger's decision predicate was `status = 'requested'` alone,
so the *approved → paid* step the endpoint tells you to take could never
succeed: an approved withdrawal was stuck, and only a hand-edit of the database
could record that money had left. Both fixed; the desk is in `/admin`.

**`/api/economy` was public.** It answers "what does each SKU cost us against
what we charge" — provider cost per top-up, per subscription month, per 3D
forge, plus fixed overhead and the price floors. No key, no rate limit. Anyone
with the URL could read the commercial position of the business. Now behind
`MODERATION_KEY` like `/api/traffic`, failing closed, with a regression test.

**`npm test` now exists.** The suite was only runnable by someone who already
knew an undocumented ritual, which is exactly how `tests/t2b.js` sat permanently
red and `tests/t6` reported a passing narrative while asserting nothing. One
command builds and runs all 27 files — **578 assertions** — and a file that
prints failures while exiting 0 is now counted as failing.

Also cleared: a GitHub Pages workflow that had failed **125 times** deploying a
copy of the site with no API (deleted — Vercel is the deployment); `t2b`
(superseded and permanently throwing — removed); `/api/checkout` reflecting raw
input in an error body; and the thirteen documents that exist twice, in `docs/`
and `frontend/specs/`, with nothing detecting drift (`t23`, 54 assertions).

## Testers are funded, everyone else is gated — shipped 18 Aug

Signup used to hand every verified email **2,000 real ACUs** — £20 of spendable AI
credit per address, with a self-serve refill on top. That was a free tier nobody
decided to build, and it contradicted the standing rule. Wallets now carry one of
three categories, defined once in `shared/payments.ts`:

| | who sets it | credit |
|---|---|---|
| `standard` | public signup | **zero** — tops up to forge |
| `tester` | an admin, via `/admin` → "Make tester" | refills itself to `TESTER_CEILING_ACU` (20,000) |
| `purchased` | verified Stripe settlement | **terminal** — can never be reclassified |

The point of the terminal rule: nobody turns a paying customer into a free-refill
account, by accident or otherwise. The refill's guards are all in one conditional
UPDATE (tester · below the ceiling · past the cooldown), so two concurrent refills
cannot both credit. 29 assertions in `tests/t6-freeacu.js`, plus 10 in a real
browser in `tests/t22-tester-designation.mjs`.

**Existing wallets were deliberately NOT migrated.** Every row created before this
is still `tester`, because reclassifying live accounts is a decision, not a
migration. Open `/admin`, load the wallet list, and press "Revoke tester" on
everyone who is not actually a tester — the column default now creates gated
accounts, so this is a one-time pass.

## Charge on accept — shipped 18 Aug

A creator is no longer charged for a build they do not keep. The forge takes a HOLD
(250 3D / 150 2D) but collects nothing. Publishing the game, or spending an Enhance
pass on it, settles it to what the run actually cost (~40-95) and refunds the rest.
Refine, discard or walk away and the whole hold returns; an undecided hold is swept
back after 24 hours. This closes the case that mattered: a build that RENDERS but is
worthless used to be charged in full, and the render watchdog only covered builds
that drew nothing. 25 assertions in `tests/t21-charge-on-accept.js`.

## Forge holds were blocking paying work — FIXED 18 Aug

"Not enough ACUs" on a 1,068 balance, with the platform demo game shown instead of
the build. The 3D forge RESERVED 1,200 ACU up front, but a real 3D build settles at
40-51 — the hold was 23x the cost, so a creator with enough for ~20 games could not
start one. A hold is not a price: it is refunded in the same request, so no charge
changes. Now 250 for 3D and 150 for 2D, against a worst measured settle of 93.

## Blueprint blocker — FIXED 18 Aug

"Blueprint generation failed — Expected ',' or ']' after array element in JSON at
position 6220". Not a malformed model reply: a TRUNCATED one, cut in the wrong place
by us. Extraction ran `indexOf("{")` to `lastIndexOf("}")`, so a reply that stopped
mid-array ended on a nested object's brace, leaving an unclosed array. Three causes,
all fixed: balanced-brace extraction that returns null rather than a broken slice,
max_tokens 4000 -> 8000, and a claude -> gemini -> openai chain (the blueprint had ONE
provider while the game path had three). 20 assertions in `tests/t20-blueprint-json.js`.

## The forge diagnosis — 18 Aug, from /api/forge-log + /api/provider-selftest

- **No forge has run since 12 Aug 16:03.** The sea/sky fixes landed 14 Aug, so the
  runtime that painted an ocean over every sky was live for every build Justin ever judged.
- **All three providers are healthy** (anthropic 2.2s, gemini 3.9s, openai 2.0s). The
  Gemini 403 is resolved.
- **Every successful build in the log shipped from openai/gpt-4o.** The chain led with
  openai because on 2 Aug Claude truncated and Gemini was 403 — but Claude truncated
  because there was no runtime yet and the prompt asked for 800-1100 lines. The runtime
  landed 9 Aug; the target is now 260-420. That evidence was stale.
- **The real defect: openai's 3D build is a STUB.** /api/forge-selftest, full size:
  gemini 39.2s / 35,973 bytes / 9,520 tokens OK · openai 24.6s / **8,411 bytes** / 1,809
  tokens OK · claude 159.1s TRUNCATED. openai's build is smaller than Dino Island
  (10,975 bytes), the leanest complete game on the runtime — it boots the engine, passes
  every structural gate, and is nothing to play. That is what shipped from every recorded
  forge. **3D now leads with gemini**, the only provider producing a complete build.
- **A substance floor rejects sub-9,500-byte 3D builds** (demoted to fallback, not
  discarded), so a stub can never ship again while a fuller build exists.
- **BUILD_ID now comes from the deployed commit.** It read `2026-08-12.77` on 18 Aug, so
  it could not answer whether a push was live.

## Waiting on Justin

| # | Thing | Detail |
|---|---|---|
| 1 | Upload the asset packs | **PART DONE.** 152 rigged Quaternius models landed 22 Aug and are live — but that was 10 of 28 character packs. **18 are still missing**, 8 of them having vanished silently into the `.gitignore`. Justin has the drive; `UPLOADING-ASSETS.md` is the runbook and `node tools/check-incoming.mjs` verifies the next upload before it is committed. |
| 2 | **Forge a 3D game and send the log** | Attempted 22 Aug: the first run died on a runtime TypeError (fixed), the second shipped two models on an empty field (a gate now refuses that). Still no build Justin has judged good. Send `/api/forge-log` — `provider`, `bytes`, `models` — or the file from **View Build Source**, which turns guessing into fixing. |
| 2b | **Gate the legacy wallets** | Every account created before 18 Aug is still `tester` and can refill itself for free. One pass through `/admin` → "Revoke tester" on everyone who is not a real tester. |
| 3 | **Set `NEWSLETTER_SECRET` in Vercel** | Any long random string. Without it the unsubscribe link still works, but the token is not signed, so anyone could unsubscribe another address. |
| 4 | **Confirm the newsletter send** | It is live but has never sent to a real inbox. Run `GET /api/newsletter?dry=1` with `x-moderation-key` first — it reports the audience size and sends nothing. |
| 5 | **ROTATE THE NEON PASSWORD — P1, do this first** | It was pasted into chat, then written verbatim into this file in `d27bde2` as a reminder. **This repository is PUBLIC**, so a live database password has been readable by anyone since that commit. The literal is removed from HEAD, but removing it does not remove it from git history and must not be mistaken for a fix: rotate the credential in Neon, update `DATABASE_URL` in Vercel, redeploy. Until it is rotated it is compromised. Never write a credential here again — this entry is the reason the rule exists. |
| 6 | **Add three Stripe webhook events** | The leak fixes only fire if Stripe sends the events. In Developers → Webhooks, add **`customer.subscription.updated`**, **`invoice.payment_failed`** and confirm **`charge.refunded`** is on. Without `customer.subscription.updated` a lapsed subscription keeps its commission rate — leak #5 stays open no matter what the code says. |
| 7 | **Check the dunning setting** | Billing → Subscriptions → "Manage failed payments". If it is set to **mark unpaid** rather than **cancel**, `customer.subscription.deleted` never fires at all. Either setting is now handled, but knowing which one is live tells you how long a non-payer keeps their plan. |
| ~~8~~ | ~~Decide the free-play question~~ | **DECIDED 25 Aug: "keep both as they are."** Priced games need an entitlement, unpriced games play for anyone, and the 14-day clearing window stands. Both recorded at the top of this file — do not reopen either on inference. |

## Waiting on me — nothing

Everything asked for is committed and pushed. Nothing half-finished.

---

## Live

- **3 reference games**: `/games/midnight-post`, `/games/wonderverse`, `/games/dino-island` —
  all verified in a real browser at desktop and phone size; Midnight Post is played
  start-to-finish by `tests/t26`. All three are on the arcade shelf and in the sitemap.
- **JOSHRIX 3D runtime** (`assets/vendor/joshrix3d-1.js`) — owns canvas, loop, sky, ground,
  lights, shadows, overlays, HUD, input, audio, particles. Games write only the concept.
- **2,435 models / 2,553 sprites**, every one load-tested in a browser before shipping.
- **`/features`** pillar page + 36 blog topics (22 feature-driven, 14 editorial).
- **Cookieless analytics** + a funnel endpoint that says in plain words where acquisition breaks.
  Campaign clicks are tagged `?ref=newsletter` so email traffic is not counted as direct.
- **Weekly newsletter** (`/api/newsletter`, cron Tue 10:00 UTC) to every registered account:
  4 rotating capabilities + fresh blog posts + new arcade games, ~14 links per issue.
  One-click unsubscribe at `/unsubscribe`. Sends are claimed per address per ISO week,
  so a retried cron cannot mail anyone twice.
- **PWA menu** on all 32 pages.
- **Launch screens** on every installable page (34 incl. both games and `/play/<id>`):
  32 iOS images across 16 devices x 2 orientations, injected from `frontend/assets/splash.js`.
  Android uses the manifest's `background_color` + 512 icon and needs no images.
  Regenerate with `node tools/make-splash.mjs` after changing the device table.

## Known gaps, stated plainly

- **The forge has still never produced a game Justin judged good.** This is the only thing that
  matters and it is four weeks old. Two attempts on 22 Aug: one died on `G.get().material` being
  undefined, one shipped a lone character and a crate on a bare disc in daylight. Both causes are
  fixed — `G.tint()` exists and the engine floor now demands five library models — but "fixed"
  means the failure cannot recur, not that the next build is good.
- ~~Only 10 human characters~~ **152 rigged models, 178 animated, live since 22 Aug.** The library
  is no longer the constraint; what the forge does with it is.
- **Reading a real FBX is untested.** `tools/ingest-characters.mjs` handles `.glb` and `.gltf`
  with 40 passing tests; the FBX path cannot be tested without a real file.
- **Zero customers.** SEO on a new domain is months, not weeks. The fast organic channel is
  shareable game links, which depends on the forge working.
- **`t26` is still intermittent — roughly 1 full-suite run in 3.** It passes every time on its
  own and fails only under the load of the whole suite, always on the same assertion (the
  autopilot delivering 1 parcel of 8). I paced it off `G.elapsed` rather than wall-clock on
  22 Aug, which fixed the worst of it but not all of it: the browser is still competing with
  two other Playwright files for CPU, and a starved autopilot steers badly. It is a test
  problem, not a game problem — Midnight Post plays correctly every time a human or a
  standalone run drives it. Not chased further because nothing in the money work touches it,
  but it should not be read as a green suite until it stops.

## Still open, and honestly named

| Thing | Why it is still open |
|---|---|
| **Stripe Connect onboarding** | Until this is done, payouts leave by hand: the desk records the decision, you move the money, then mark it paid. Needs your Stripe account, not code. |
| **Backup / restore drill** | Neon snapshots have never been restored. Take one manual snapshot before announcing. |
| **Live payment cycle test** | `tests/live-payment-cycle.md` has never been run against real Stripe. Needs live keys. |
| ~~No sound library~~ | **CLOSED 22 Aug in code, not by a download.** `G.sfx()` is 20 designed sounds and `G.ambience()` is 7 looping beds, all synthesised — no files, no dependency, no page weight. The engine floor now refuses a 3D build where nothing the player does makes a sound. |
| **2D port of the runtime** | The 3D runtime owns canvas, loop, lights, HUD, input. The 2D lane still has the model write all of that each time. |
| **`GAP-ANALYSIS.md` is published at `/docs`** | It is a forensic list of the platform's own weaknesses, served publicly. Not a defect — a decision. Say if you want it unpublished. |

---

## Environment limits (why some things can only be done by Justin)

- No AI provider keys here → **I cannot run a forge.**
- Proxy blocks joshrix.com, quaternius.com, poly.pizza, mixamo.com → **I cannot see the live
  site or download assets.**
- GitHub clone/push works. Playwright + Chromium works, so anything servable locally can be
  rendered and screenshotted.

## Standing rules

No free AI — every account pays · `MODERATION_KEY` is the only admin credential and is never
shared · never commit secrets · branch is `claude/joshrix-studio-branding-hzl94h`.
