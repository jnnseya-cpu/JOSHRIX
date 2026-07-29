# JOSHRIX Studio — Application Build Specification (MVP Web App)

The concrete application-level spec for the first buildable web app — Firestore-style collections, app routes, and screen requirements. This is the MVP-scale realisation of the enterprise architecture in [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md); financial ledgers still follow the PostgreSQL double-entry rule.

## Game Engine Strategy

| Phase | Engine | Supports |
|---|---|---|
| 1 — Web | Phaser.js | 2D platformers, runners, puzzle, quiz, card, clicker, tycoon, arcade, educational, simple sports |
| 2 — 3D | Three.js | 3D runners, simple racing, 3D object games, virtual rooms, basic simulators |
| 3 — Advanced export | Unity export, Godot export, mobile app build, Steam package | Console not supported initially |

## Content Blocklist & Per-Game Record

**Must block:** copyrighted characters · real football clubs without licence · Disney-style clones · Nintendo-style clones · Marvel/DC-style clones · celebrity likeness misuse · illegal gambling · adult content for minors · violent extremist content · fraudulent game promises · stolen assets.

**Every game receives:** IP risk score · age rating · content rating · commercial usage status · licence status · moderation status.

## Database Collections

| Collection | Key Fields |
|---|---|
| users | id, email, displayName, role, country, currency, creditBalance, walletBalance, kycStatus, paymentCustomerId, payoutAccountId, status, createdAt, updatedAt |
| games | id, creatorId, title, slug, description, genre, engine, status, visibility, version, thumbnailUrl, demoUrl, buildUrl, sourceUrl, price, currency, monetisationType, commercialScore, ipRiskScore, ageRating, approvalStatus, createdAt, updatedAt — statuses: draft, generating, testing, ready, published, listed, sold, suspended, archived |
| gameBlueprints | id, gameId, creatorId, rawPrompt, improvedPrompt, gameDesignDocument, mechanics, levels, characters, economy, monetisationPlan, aiProvider, tokensUsed, creditsCharged, createdAt |
| gameAssets | id, gameId, creatorId, type (character, background, music, sound_effect, icon, map, animation, ui, thumbnail), name, fileUrl, prompt, style, licenceStatus, ipRiskScore, createdAt |
| gameBuilds | id, gameId, version, engine, buildStatus, buildLogs, buildUrl, sourceZipUrl, errorLogs, createdAt |
| marketplaceListings | id, gameId, creatorId, listingType (full_game, template, asset_pack, mechanic, service, white_label_game), title, description, category, price, currency, licenceType, status, views, salesCount, rating, createdAt, updatedAt |
| orders | id, buyerId, sellerId, listingId, gameId, amount, platformFee, sellerEarnings, paymentStatus, licenceType, paymentIntentId, createdAt |
| payouts | id, creatorId, amount, currency, status, transferId, requestedAt, paidAt |
| aiCreditTransactions | id, userId, actionType, creditsUsed, cashEquivalent, aiProvider, model, providerCost, platformMargin, status, createdAt |
| licences | id, buyerId, sellerId, gameId, listingId, licenceType (personal, commercial, extended_commercial, exclusive, white_label), rights, canResell, canModify, canExport, exclusive, createdAt |
| moderationQueue | id, gameId, creatorId, issueType, riskLevel, aiNotes, adminDecision, status, createdAt, reviewedAt |

## Application API Routes

| Group | Routes |
|---|---|
| Auth | POST /api/auth/register · POST /api/auth/login · GET /api/me · PATCH /api/me · POST /api/auth/logout |
| Game creation | POST /api/games/create · POST /api/games/:id/generate-blueprint · /generate-assets · /generate-code · /run-tests · /build · /publish · GET /api/games/:id · GET /api/users/:id/games |
| AI agents | POST /api/agents/idea · /design · /mechanics · /assets · /code · /monetisation · /marketplace · /qa · /ip-check |
| Marketplace | POST /api/marketplace/list · GET /api/marketplace · GET /api/marketplace/:slug · POST /api/marketplace/:id/buy · POST /api/marketplace/:id/review · PATCH /api/marketplace/:id |
| Payments | POST /api/credits/buy · POST /api/checkout/game · POST /api/checkout/licence · POST /api/webhooks/payments · GET /api/wallet · POST /api/payouts/request |
| Admin | GET /api/admin/users · /games · /revenue · /ai-costs · /moderation · POST /api/admin/moderation/:id/approve · /reject · POST /api/admin/users/:id/suspend · POST /api/admin/listings/:id/feature |

## Credit Usage (MVP examples, £1 = 100 credits)

Game idea 20 · full blueprint 100 · 5 assets 150 · prototype 500 · full playable game 2,000 · monetised game 5,000 · marketplace package 300 · QA test 100 · source export 1,000. **Admin must track:** user charge, provider used, provider cost, platform margin, failed-generation refunds, abuse detection, credit balance.

## MVP Revenue Splits

Marketplace default 30/70 (platform/creator) · exclusive sale 25/75 · in-game purchases 10/90 after payment fees · asset sales 30/70. (The subscription-tier commission ladder in [MONETISATION.md](MONETISATION.md) refines these for paying tiers.)

## Marketplace Requirements

Search · filters · categories · ratings · reviews · demo play · buy button · licence selector · creator profile · featured games · trending · recently added · top earners · top templates · admin approval.

**Categories:** Arcade, Puzzle, Sports, Education, Strategy, Simulation, Racing, RPG, Card, Kids, Business, Casino-style (non-gambling), Templates, Assets, Mechanics, UI kits.

## Creator Revenue Dashboard

**Shows:** total sales, monthly revenue, pending payouts, platform fees, best-selling games, conversion rate, marketplace views, demo plays, refunds, licence sales, in-game purchase revenue, AI credits spent, profit estimate.

**AI recommendations:** increase price · improve thumbnail · add demo video · add mobile version · offer commercial licence · create sequel · bundle assets · run promotion.

## Admin Dashboard

**Sees:** total users, active creators, games created/published, marketplace sales, credit sales, AI provider cost, gross revenue, net platform margin, failed builds, moderation queue, top creators, suspicious users, refund requests, payout requests, copyright alerts, high-risk content.

**Actions:** approve game, reject game, suspend listing, suspend user, feature game, edit commission, refund order, release payout, block keyword, force IP review.

## Security Requirements (MVP checklist)

Role-based access control · Firestore security rules · payment webhook verification · file upload validation · rate limiting · prompt abuse detection · malware scan on exported files · admin audit logs · user activity logs · secure asset storage · private source code access · signed URLs · KYC before payout · two-factor authentication for admins.

**Secrets policy:** API keys and service-account credentials live ONLY in environment variables / Secret Manager — never in code, chat logs, prompts, or the repository. See `.env.example` at the repo root for the variable names. Any key that has been pasted into a chat, document, or prompt is compromised and must be rotated immediately.

## Pre-Publish Safety Gate

Every game must pass, before publishing: copyright similarity check · trademark keyword check · asset originality check · prompt policy check · age suitability check · commercial licence check · marketplace quality check.

**Blocked prompt examples:** "Make me Mario" · "Create FIFA game" · "Use Spider-Man" · "Copy Fortnite" · "Make Disney-style Frozen game" · "Real gambling casino with cash betting" (unless licensed and jurisdiction-approved).

## Build Pipeline (13 steps)

User submits idea → Idea Agent improves it → Design Agent creates GDD → **user approves blueprint** → Asset Agent creates assets → Code Agent creates game files → QA Agent tests → system builds playable version → **user previews** → user publishes or lists → Marketplace Agent creates listing → **admin/IP system approves listing** → game available for play/sale.

## Recommended MVP Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Next.js · React · TailwindCSS · Shadcn UI · Framer Motion · Phaser.js · Three.js |
| Backend | Firebase Auth · Firestore · Firebase Storage · Cloud Functions · Cloud Run · Cloud Tasks · BitriPay/Stripe + Connect · SendGrid/Brevo |
| AI layer | OpenAI · Gemini · Claude · Vertex AI behind the custom AI Gateway — provider cost tracker, fallback routing, prompt logging, credit billing engine |
| Infrastructure | Vercel or Firebase App Hosting · Cloud Run build workers · Firebase Storage for game files · Firestore for operational data · BigQuery later for analytics |

## MVP Scope

**Must include:** registration · creator dashboard · AI game idea generator · blueprint generator · simple Phaser.js game generation · asset generation · game preview · credit purchase · publishing · marketplace listing · game purchase · platform commission · creator wallet · admin dashboard · moderation queue.

**MVP game types:** quiz · clicker · 2D runners · puzzle · simple football penalty game · educational mini-games · card matching. **Do not start with complex multiplayer or 3D open-world games.**

## Version Roadmap

| Version | Delivers |
|---|---|
| 1 | Web 2D games; AI credits; marketplace; basic asset generation; creator payouts; admin moderation |
| 2 | Advanced templates; reskinning; in-game purchases; leaderboard; achievements; PWA export; team accounts |
| 3 | 3D games; multiplayer lobby; white-label export; mobile packaging; creator API; external publishing |
| 4 | Unity/Godot export; AI NPCs; creator tournaments; game investment marketplace; AI-generated trailers; advanced analytics |

## Non-Negotiable Product Rules

The platform must be: fast · simple · commercial · creator-friendly · marketplace-first · AI-credit monetised · legally controlled · admin-controlled · scalable · export-ready · revenue-tracked · IP-protected.

**The user must never feel they are coding. The user must feel they are commanding a game studio.**

## Core Commercial Advantage & Final Instruction

Most game builders stop at creation. This platform owns the full chain: create → build → test → publish → sell → licence → host → monetise → analyse → improve → resell — which makes it harder to replace.

Build JOSHRIX Studio as a modular AI-powered SaaS platform where every major function is agent-driven, credit-metered, marketplace-enabled, and revenue-tracked — the place where non-technical users create, sell, buy, licence, and build income from games, while the platform earns from every creation, sale, payment, export, licence, hosting plan, and upgrade.
