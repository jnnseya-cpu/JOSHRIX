# Where the platform actually is

One file, kept current. Read this before asking or answering "what's the state of X" —
holding this in conversation is what causes the same ground to be covered twice.

Last updated: 2026-08-20 (third reference game, played end to end by a test)

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
| 1 | **Upload the asset packs** | Still empty as of 20 Aug — `_incoming/` contains only its two READMEs. I cannot fetch them: quaternius.com, poly.pizza and mixamo.com are all blocked by the proxy (re-checked, all return 000). Kenney City Kit → `_incoming/` as a zip. Quaternius Characters/Monsters/Animals → `_incoming/characters/<pack>/` as folders, taking the **glTF** folder. Full steps in `frontend/assets/models3d/_incoming/characters/README.md`. **This is the only thing standing between the library and characters that do not look like Lego** — no code change fixes it. |
| 2 | **Forge WonderVerse in 3D on the live site** | The sea and sky bugs are fixed and deployed. I cannot run a forge — no provider keys here, and the proxy blocks joshrix.com. Your own wallet predates the category change so it is still `tester`: press **refill** on `/wallet` for 20,000 ACUs, no admin key needed. Then send the `/api/forge-log` line — `build`, `provider`, `bytes`. |
| 2b | **Gate the legacy wallets** | Every account created before 18 Aug is still `tester` and can refill itself for free. One pass through `/admin` → "Revoke tester" on everyone who is not a real tester. |
| 3 | **Set `NEWSLETTER_SECRET` in Vercel** | Any long random string. Without it the unsubscribe link still works, but the token is not signed, so anyone could unsubscribe another address. |
| 4 | **Confirm the newsletter send** | It is live but has never sent to a real inbox. Run `GET /api/newsletter?dry=1` with `x-moderation-key` first — it reports the audience size and sends nothing. |
| 5 | **Rotate the Neon password** | `npg_fK1p7jxceMgo` was pasted into chat earlier. Still outstanding. |

## Waiting on me — nothing

Everything asked for is committed and pushed. Nothing half-finished.

---

## Live

- **3 reference games**: `/games/midnight-post`, `/games/wonderverse`, `/games/dino-island` —
  all verified in a real browser at desktop and phone size; Midnight Post is played
  start-to-finish by `tests/t26`. All three are on the arcade shelf and in the sitemap.
- **JOSHRIX 3D runtime** (`assets/vendor/joshrix3d-1.js`) — owns canvas, loop, sky, ground,
  lights, shadows, overlays, HUD, input, audio, particles. Games write only the concept.
- **2,273 models / 2,553 sprites**, every one load-tested in a browser before shipping.
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

- **The forge has never produced a game Justin judged good.** Two runtime bugs that made every
  3D build render an unrequested ocean over the creator's sky were only fixed on 14 Aug and have
  not been tested through an actual forge run yet. That test is item 2 above.
- **Only 10 human characters in the library**, all blocky. This is why output reads as Lego.
  Fixed by item 1 above, not by any code change.
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
| **No sound library at all** | There are **zero** audio files in `frontend/assets`. The runtime synthesises with an oscillator and speaks with the Web Speech API — which is why the games beep. The "705 sound files" were never ingested and there is no ingest tool for audio. |
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
