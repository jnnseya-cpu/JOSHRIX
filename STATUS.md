# Where the platform actually is

One file, kept current. Read this before asking or answering "what's the state of X" —
holding this in conversation is what causes the same ground to be covered twice.

Last updated: 2026-08-25 (money-leak audit: twelve ways the platform worked for free, all closed)

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

**Residual risk, stated plainly.** `EARNINGS_CLEARING_DAYS` is 14. UK card disputes can be
raised up to 120 days out, so a patient fraudster can still outrun it; what 14 days stops is
the same-day cash-out, which is the version that gets automated. Raise the constant if real
dispute data says otherwise — it is read in one place.

**Not closed, because it is a business decision and not a leak:** free (unpriced) games
still play for anyone. That costs no provider money — the creator already paid to forge it —
so it is a funnel choice, not a loss. See the free-play decision still waiting below.

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

**THE DECISION WAITING FOR JUSTIN.** Does a stranger get to play ANYTHING before paying?
It governs the whole funnel and cannot be inferred from the rule as stated:

- **Nothing free at all** — every game requires an account with credit. Cleanest read of
  the rule. Costs the shop window: GO-TO-MARKET's press story is "a stranger plays a
  Nairobi student's game from a link", and `/api/seo` + the sitemap are built to send
  strangers to playable pages.
- **A demo is free, the catalogue is paid** — the three reference games stay open as the
  shop window; every creator game requires purchase. Protects creator earnings, keeps
  acquisition, and is what the marketplace lane already implies.

Until he says which, the arcade stays as it is. Do not paywall it on inference.

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

Nothing further needs uploading for models or sprites. The **only** asset class the
platform has never had is audio — and as of 22 Aug that is closed in code rather than
by a download (below), so there is now no outstanding upload at all.

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
| 1 | ~~Upload the asset packs~~ | **DONE 22 Aug.** 152 rigged Quaternius models landed and are live. See the library section above. |
| 2 | **Forge a 3D game and send the log** | Attempted 22 Aug: the first run died on a runtime TypeError (fixed), the second shipped two models on an empty field (a gate now refuses that). Still no build Justin has judged good. Send `/api/forge-log` — `provider`, `bytes`, `models` — or the file from **View Build Source**, which turns guessing into fixing. |
| 2b | **Gate the legacy wallets** | Every account created before 18 Aug is still `tester` and can refill itself for free. One pass through `/admin` → "Revoke tester" on everyone who is not a real tester. |
| 3 | **Set `NEWSLETTER_SECRET` in Vercel** | Any long random string. Without it the unsubscribe link still works, but the token is not signed, so anyone could unsubscribe another address. |
| 4 | **Confirm the newsletter send** | It is live but has never sent to a real inbox. Run `GET /api/newsletter?dry=1` with `x-moderation-key` first — it reports the audience size and sends nothing. |
| 5 | **Rotate the Neon password** | `npg_fK1p7jxceMgo` was pasted into chat earlier. Still outstanding. |
| 6 | **Add three Stripe webhook events** | The leak fixes only fire if Stripe sends the events. In Developers → Webhooks, add **`customer.subscription.updated`**, **`invoice.payment_failed`** and confirm **`charge.refunded`** is on. Without `customer.subscription.updated` a lapsed subscription keeps its commission rate — leak #5 stays open no matter what the code says. |
| 7 | **Check the dunning setting** | Billing → Subscriptions → "Manage failed payments". If it is set to **mark unpaid** rather than **cancel**, `customer.subscription.deleted` never fires at all. Either setting is now handled, but knowing which one is live tells you how long a non-payer keeps their plan. |
| 8 | **Decide the free-play question** | Still open — see the top of this file. It is the one money question I have deliberately not answered for you, because it is a funnel decision rather than a leak. |

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
