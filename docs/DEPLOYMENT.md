# JOSHRIX Studio — Deployment Architecture (Hostinger + Vercel + Firebase)

The chosen stack, with each service doing only what it is best at.

## Role Assignment

| Service | Use it for | Do NOT use it for |
|---|---|---|
| **Hostinger** | Domain registration + DNS only | Web hosting, email-heavy setups (its hosting would fight Vercel) |
| **Vercel** | The Next.js app: all 20 frontend pages, API routes, server actions, the AI Gateway (server-side), edge caching, previews per PR | Long-running jobs (function timeout limits), storing files |
| **Firebase** | Auth (email/Google/phone, MFA), Firestore (operational data: users, games, blueprints, listings), Storage (assets, thumbnails, game builds), FCM push | The financial ledger (see below), long AI jobs from the client |
| **Cloud Functions v2 / Cloud Run** (same Google project as Firebase) | The forge pipeline workers: blueprint → assets → code → QA jobs that run minutes, triggered via a job queue | — |

## The Architecture

```
                    ┌─────────────────────────────────────────────┐
 joshrix.com  DNS   │                  VERCEL                     │
 (Hostinger) ─────▶ │  Next.js app                                │
  A/CNAME → Vercel  │  ├─ frontend pages (static + RSC)           │
                    │  ├─ /api/* routes  ── auth check ──┐        │
                    │  └─ AI Gateway (server-only code)  │        │
                    └───────────┬────────────────────────┼────────┘
                                │ Firebase Admin SDK     │ enqueue job
                                ▼                        ▼
                    ┌───────────────────────┐  ┌──────────────────────┐
                    │       FIREBASE        │  │  CLOUD RUN / FUNCS   │
                    │  Auth · Firestore ·   │◀─│  Forge workers:      │
                    │  Storage · FCM        │  │  agents, builds, QA  │
                    └───────────┬───────────┘  └──────────┬───────────┘
                                │                         │ calls
                                ▼                         ▼
                    ┌───────────────────────┐  ┌──────────────────────┐
                    │  Postgres (Neon/      │  │  AI providers:       │
                    │  Cloud SQL) — LEDGER  │  │  Anthropic·Gemini·   │
                    │  + BitriPay/Stripe    │  │  OpenAI (server keys)│
                    └───────────────────────┘  └──────────────────────┘
```

## How It Actually Deploys — one provider, one command

> **Corrected 11 Sep 2026.** This section used to describe a split deployment —
> frontend on Vercel, backend on Firebase Cloud Functions — and called `api/` an
> "optional same-origin mirror". That was backwards, and it had been backwards
> for months. `api/` IS the backend: 62 modules, the ledger, the paywall, the AI
> gateway, the moderation queue and every one of the 43 test files. The Firebase
> Functions codebase exposed nine routes that `api/` already had, was never in
> the live path (`frontend/assets/config.js` sets `JOSHRIX_API_BASE = ''`, i.e.
> same origin), and carried its OWN `/stripe-webhook` with no ledger behind it.
> Deploying it would have stood up a second system able to take card payments
> with no double-entry record. It has been removed along with `firebase.json`.
> If you want it back it is in git history — but do not deploy two payment paths.

**Everything is one Vercel project.** `vercel.json` serves `frontend/` as the
static site (`outputDirectory: "frontend"`, `cleanUrls: true`) and every
`api/*.ts` file as a serverless function on the same origin. There is no second
backend, no CORS, and no `JOSHRIX_API_BASE` to set.

1. **Deploy**: vercel.com → Add New Project → import `jnnseya-cpu/JOSHRIX` →
   Deploy. Zero config; `vercel.json` owns the rewrites, crons, function
   timeouts and security headers.
2. **Set the environment**: see `.env.example`, which is a contract rather than a
   wish list — every name in it is read by code, and the sections say which are
   required, which are recommended, and which integrations do not exist yet.
   At minimum you need `DATABASE_URL`, `MODERATION_KEY`, one AI provider key,
   `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, plus `PAYOUT_SECRET` before
   any creator can withdraw.
3. **Verify**: `curl -s https://<host>/api/health`. It reports the build, whether
   the ledger and moderation key are configured, which AI providers are live,
   and — importantly — `forge.leadProvider` and `forge.fallbacks`, so a
   single-vendor deployment is visible as one.

### What Firebase is still used for

**Authentication, and nothing else.** A Firebase ID token is the credential;
`api/_auth.ts` verifies it against Google's published certificates with
`node:crypto`, checking `aud`, `iss`, `exp`, `iat` and the signature. There is no
`firebase-admin` dependency, no Firestore, and no Firebase Storage — all
persistent data lives in Neon Postgres behind `api/_ledger.ts`, which is a
deliberate rule from the app spec: money never lives solely in Firestore.

The client config in `frontend/assets/config.js` is public by design. The project
id is also a constant in `shared/firebase.ts`, asserted equal by
`tests/t33-auth.js`, because a mismatch means the server rejects every token the
client can produce.

## Setup Steps

1. **Hostinger**: buy the domain. In DNS, add `A @ → 76.76.21.21` and `CNAME www → cname.vercel-dns.com` (Vercel shows the exact records when you add the domain). Turn OFF Hostinger's own hosting/parking for the domain. Optionally keep Hostinger email or add MX for your mail provider.
2. **Vercel**: import the GitHub repo — the root `vercel.json` already serves `frontend/` as a static site with security headers and clean URLs, so the current 21 pages (including the Web 3D engine profile at `/play3d`) deploy zero-config today; grow it into the Next.js app later. Add the domain. Set env vars (Production + Preview): `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `FIREBASE_*` client config, and `FIREBASE_SERVICE_ACCOUNT` (Admin SDK JSON pasted as a single env var — never in the repo).
3. **Firebase**: create the project; enable Auth (add `joshrix.com` + the `*.vercel.app` preview domain to **Authorized domains**), Firestore (production mode + security rules from APP-BUILD-SPEC), and Storage. Client SDK config keys are public by design — security lives in the rules, not in hiding the config.
4. **Workers**: deploy the forge pipeline as Cloud Run services (or Cloud Functions v2, up to 60-min timeouts) in the same Google project — they share Firebase credentials natively. Vercel API routes enqueue jobs (Cloud Tasks or a Firestore `jobs` collection the worker watches) and the frontend subscribes to progress via Firestore listeners — that's your live agent-status UI for free.

## The Request Flows

- **Auth**: browser signs in with Firebase Auth client SDK → gets ID token → sends it as a Bearer header to Vercel API routes → routes verify with Firebase Admin SDK → role check per `shared/contracts.ts` roles.
- **Forge**: page → `POST /api/games/:id/generate-blueprint` on Vercel → quick AI Gateway call (blueprint fits in a function) returns directly; long jobs (assets, code, build, QA) are enqueued → Cloud Run worker runs the agents, writes progress to Firestore → the dashboard's live listeners render agent status.
- **Payments**: BitriPay/Stripe checkout session created server-side on Vercel; webhooks land on a Vercel route, verified, then written to **Postgres** (double-entry postings) with Firestore mirroring display-only balances.

## Hard Rules

1. **AI keys never reach the browser.** All provider calls happen in Vercel server code or Cloud Run. If a key appears in client-side JS, it's public.
2. **The money ledger is not Firestore.** Firestore holds operational data; transactions/payouts/ACU postings live in Postgres (Neon free tier is fine at MVP) with the gateway (BitriPay/Stripe) as the source of truth — per APP-BUILD-SPEC's "financial ledgers must never live solely in Firestore".
3. **Nothing long-running on Vercel.** Function limits make multi-minute forge jobs fail mid-run; they belong on Cloud Run. Vercel enqueues, Firebase streams progress.
4. **Firestore security rules are the backend's front door.** Client SDK reads/writes must be constrained by rules (owner-only game docs, public read on published listings); everything privileged goes through Vercel/Cloud Run with the Admin SDK.
5. **Game builds** are written by workers to Firebase Storage and served through its CDN URLs; move hot titles to Cloudflare R2 later per the platform spec — nothing in this architecture blocks that.

## Why not the alternatives

- **Hostinger hosting for the site**: no preview deploys, no edge network comparable to Vercel, and you'd maintain servers. Use it purely as registrar.
- **Firebase Hosting for the frontend**: workable, but Vercel's Next.js support (RSC, image optimisation, per-PR previews) is materially better for this app.
- **Everything on Vercel (incl. data)**: Vercel Postgres/KV could replace Firebase, but you lose Firebase Auth's mature MFA/social flows and Firestore's real-time listeners — which are exactly what the live forge dashboard needs.

This maps cleanly onto the enterprise architecture in [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md): Vercel is the gateway + BFF tier, Cloud Run is the agent runtime, Firebase is Auth + the Firestore session/document store, Postgres is the ledger — so scaling up later (Phases 2–4) is an evolution, not a rewrite.
