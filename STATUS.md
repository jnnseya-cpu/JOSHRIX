# Where the platform actually is

One file, kept current. Read this before asking or answering "what's the state of X" —
holding this in conversation is what causes the same ground to be covered twice.

Last updated: 2026-08-17

---

## Waiting on Justin

| # | Thing | Detail |
|---|---|---|
| 1 | **Upload the asset packs** | Kenney City Kit → `_incoming/` as a zip. Quaternius Characters/Monsters/Animals → `_incoming/characters/<pack>/` as folders, taking the **glTF** folder. Full steps in `frontend/assets/models3d/_incoming/characters/README.md`. |
| 2 | **Forge WonderVerse in 3D on the live site** | The sea and sky bugs are fixed and deployed. I cannot run a forge — no provider keys here, and the proxy blocks joshrix.com. |
| 3 | **Set `NEWSLETTER_SECRET` in Vercel** | Any long random string. Without it the unsubscribe link still works, but the token is not signed, so anyone could unsubscribe another address. |
| 4 | **Confirm the newsletter send** | It is live but has never sent to a real inbox. Run `GET /api/newsletter?dry=1` with `x-moderation-key` first — it reports the audience size and sends nothing. |
| 5 | **Rotate the Neon password** | `npg_fK1p7jxceMgo` was pasted into chat earlier. Still outstanding. |

## Waiting on me — nothing

Everything asked for is committed and pushed. Nothing half-finished.

---

## Live

- **2 reference games**: `/games/dino-island`, `/games/wonderverse` — both verified in a real
  browser at desktop and phone size.
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

## Still open from earlier, not started

Stripe Connect onboarding · Gemini 403 at aistudio.google.com · backup/restore drill ·
live payment cycle test · 2D port of the runtime · 705 sound files in the mirror.

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
