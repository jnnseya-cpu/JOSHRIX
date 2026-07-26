# JOSHRIX Studio — Platform Architecture

> **Create Worlds. Build Games. Own the Future.**

JOSHRIX Studio is a production-grade, autonomous AI Infrastructure Operating System for the global independent game development market. It is not a tool, a plugin, or a creative assistant — it is an end-to-end autonomous production fleet that collapses the distance between a raw creative concept and a commercially deployable, IP-protected, revenue-generating game product.

An operator inputs a concept. The autonomous agent fleet executes in orchestrated parallel clusters to synthesise, build, validate, and publish enterprise-grade game IP with no manual production bottleneck.

## The Problem It Solves

| Pain Point | Current Reality | JOSHRIX Solution |
|---|---|---|
| Production Cost | AAA: £10M–£200M; indie: £50K–£500K minimum | Autonomous forge cycle reduces production cost by 90%+ |
| Time to Market | 12–48 month development cycles | Forge cycle targets hours to days for commercial-grade output |
| IP Protection | Creators lose IP to publishers and platforms | On-chain IP registry with sovereign licensing from first forge |
| Technical Barrier | 10–30 specialists per title | Zero-code autonomous production; prompt-to-product pipeline |
| Monetisation | Ad-hoc; most indie studios never build a viable economy | Economy Agent designs optimised monetisation loops at forge time |
| Global Distribution | Fragmented platforms (Steam, app stores, web3) | Single-click CDN deployment to all target marketplaces |
| Quality Assurance | Manual QA is expensive and slow | AI QA Agent runs mechanical, IP-safety, and age-rating checks autonomously |

## The Production Fleet — Seven Agents, One Forge Cycle

1. **Idea Agent — Neural Synthesis Engine.** Turns an operator prompt into a validated concept brief (title, genre, core loop, platform, age rating, commercial tier) with a market viability score, niche saturation index, and ranked concept variants — fed by real-time market trend data.
2. **Strategic Agent — Blueprint Architecture.** Produces the full technical blueprint (engine selection, game loop architecture, tech stack, compute budget), the economic model (monetisation design, LTV projection, pricing), the ACU cost estimate, and a risk assessment.
3. **Code Agent — Real-Time Logic Architect.** Writes clean, commented, modular production code: physics, event systems, input, save/load, and platform-specific builds — deployed in parallel clusters, with a code quality report. Operator owns full source on delivery.
4. **Asset Agent — Visual Identity Synthesiser.** Generates a cohesive identity package: characters, environments, UI, logo, promotional materials, and a full audio landscape — every asset carrying IP provenance metadata and per-asset IP safety certification.
5. **Economy Agent — Monetisation Loop Designer.** Delivers the complete economy design: pricing architecture, IAP catalogue, subscription tiers, currency design, battle pass, rewarded ad logic, LTV model, churn risk, and balance simulation. The highest-ROI agent in the fleet.
6. **QA Agent — Rigorous Validation Engine.** A mandatory pre-deployment gate: mechanical stability score, bug catalogue, IP risk assessment (trademark/copyright similarity), age-rating recommendation (PEGI/ESRB/BBFC), cross-platform compliance, and a deployment authorisation token — or rejection with remediation instructions.
7. **Deployment Agent — Global Distribution Engine.** On QA authorisation: live deployment to CDN edge nodes, marketplace listings (JOSHRIX Marketplace + Steam, Itch.io, WebGL hosts), on-chain IP registration, transaction monitoring activation, and revenue dashboard updates. Revenue-ready from the first second of availability.

## The Platform Governance Fleet

| Agent | Role | Key Function |
|---|---|---|
| Fraud Detection Agent | Security | Transaction scoring; behaviour analysis; API abuse detection |
| Compliance Agent | Regulatory | GDPR monitoring; KYC/AML triggers; jurisdictional content compliance |
| Risk Agent | Commercial Risk | Operator creditworthiness; forge risk scoring; dispute prediction |
| Revenue Optimisation Agent | Commercial | Dynamic pricing; ACU cost optimisation; upsell identification |
| Customer Support Agent | Operations | AI-first triage; ticket routing; auto-resolution |
| Marketing Intelligence Agent | Growth | Acquisition funnel analysis; retention alerts; conversion optimisation |
| System Health Agent | Infrastructure | Uptime, latency, auto-scaling, error-rate tracking |
| Bug Detection Agent | Engineering | Continuous code scanning; regression detection |
| Auto-Repair Agent | Engineering | Automated patching; service restart; rollback execution |
| AI Governance Agent | Platform Integrity | Monitors agent behaviour against policy; flags anomalies |

## User Ecosystem

| User Type | Primary Goal | Access Level |
|---|---|---|
| Solo Operator | Forge, own, and monetise game IP | Operator Portal |
| Studio Operator | Collaborative forge cycles; team IP management | Studio Dashboard + Team RBAC |
| Enterprise Licensee | White-label branded production fleet | Enterprise Admin OS |
| Marketplace Consumer | Discover and acquire games, source code, assets | Marketplace Portal |
| API Partner | Embed forge capability via API | Developer Portal + API Keys |
| Education Provider | Supervised student production with IP assignment controls | Education Admin Panel |
| Compliance Officer | Regulatory adherence across the pipeline | Compliance Command Centre |
| Platform Admin | Full system governance | Super Admin OS |
| BitriPay Merchant | Process transactions, manage settlements | BitriPay Merchant Portal |

## Operator Command Centre

Every Solo Operator receives a dedicated AI Command Centre with seven continuously running intelligence modules:

| Module | Function |
|---|---|
| Forge Intelligence Dashboard | Real-time visibility into all forge cycles; agent status; logs; re-runs |
| Market Radar | Live trend analysis; niche viability validation; monetisation benchmarks |
| IP Vault | Sovereign IP registry; certificates; licensing; marketplace listings |
| Economy Analyser | LTV simulation; economy model comparison; price-point tuning |
| Revenue Dashboard | Sales, subscriptions, royalties; payouts via BitriPay |
| Agent Control Panel | Pause, restart, re-prioritise agents; approve agent decisions |
| Security Vault | IP risk scores, compliance flags, QA reports per forge |

**Studio Operators** add: Team Forge Queue, Collaboration Layer (shared IP vault with attribution and revenue splits), Studio Analytics, and RBAC Administration. **Enterprise Licensees** receive a white-label admin OS. **Platform Super Admins** get omniscient governance across users, pipeline health, revenue, agents, security, compliance, API health, and BitriPay settlement operations.

## Platform Modules

Forge Studio (the primary command console: forge initiator, agent fleet status panel, concept brief reviewer, blueprint viewer, progress timeline, forge history, ACU consumption meter, and configurable approval gates) · IP Vault · Marketplace · Economy Lab · Analytics Command Centre · BitriPay Merchant Portal · API Developer Centre · Compliance Hub · Team Management · Enterprise Admin OS · Super Admin Centre · Subscription & Billing · Notification Centre · Audit Log · Security Settings.

## BitriPay Payment Infrastructure

BitriPay is the primary payment rail for all financial flows: subscription billing, ACU credit purchases, marketplace checkout, royalty settlements, enterprise licensing, revenue sharing, API partner billing, and refunds/disputes. Its African mobile money infrastructure (M-Pesa, Airtel Money, Orange Money, Africell, CDF) uniquely positions the platform for the rapidly growing African independent game development market.

Key webhook events: `payment.completed`, `payment.failed`, `settlement.processed`, `dispute.opened`, `dispute.resolved`, `refund.processed`, `subscription.renewed`, `subscription.failed` — each mapped to automated platform actions (unlock forge cycles, update revenue dashboards, freeze disputed transactions, run grace-period workflows).

## Technical Architecture

Cloud-native, event-driven microservices on Google Cloud Platform — horizontal scale, zero-downtime deployments, multi-region availability, autonomous self-healing, and a Zero Trust security model.

| Layer | Stack |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript; React Native + Expo (mobile); Socket.io real-time agent UI; Zustand + TanStack Query; Tailwind CSS + Radix UI; Cloudflare Pages CDN |
| Backend | Kong / GCP API Gateway; NestJS microservices; LangGraph + LangChain agent orchestration; GCP Cloud Run agent runtime; Pub/Sub + Kafka event streaming; BullMQ job queues; custom webhook engine; Redis cache |
| Data | PostgreSQL (Cloud SQL) primary; Firestore document store; Pinecone vector DB (agent memory, IP similarity); Cloudflare R2 + GCS object storage; Algolia search; BigQuery analytics |

**AI orchestration:** forge cycles run as stateful LangGraph DAGs (Idea → Strategic → Forge Cluster → QA → Deployment), with Code and Asset agents executing in parallel sub-graphs and the Economy Agent running post-merge. Pinecone provides persistent agent memory (market intelligence, forge patterns, operator preferences, IP safety knowledge). Each agent has a defined tool registry bounding its permitted API calls, and configurable human-in-the-loop approval gates sit at the concept, blueprint, and pre-deployment stages.

**Key external dependencies (primary / fallback):** text-code AI (OpenAI GPT-4o & Claude / Gemini Pro), image AI (DALL-E 3 & SDXL / Midjourney), audio AI (ElevenLabs & Suno / Mubert), payments (BitriPay / Stripe), KYC (Sumsub / Veriff), AML (ComplyAdvantage / World-Check), CDN (Cloudflare / CloudFront), IP registry (IPwe or custom on-chain / Bernstein), trademark search (USPTO & EUIPO / Markify), email (SendGrid / Brevo), SMS (Twilio / MessageBird), auth (Firebase Auth or Auth0 / Cognito), vectors (Pinecone / Weaviate), monitoring (Datadog / New Relic), analytics (Mixpanel / Amplitude), search (Algolia / Elasticsearch), documents (DocuSeal / PDFMonkey), e-signature (DocuSign / HelloSign), CRM (HubSpot / Salesforce), tax (TaxJar / Avalara), billing (Stripe Billing / Chargebee), age ratings (IARC / custom classifier), platform SDKs (Apple, Google, Valve / Expo, Capacitor).

Deeper specifications: [Zero Trust security & compliance](SECURITY.md) · [database schema](DATA-MODEL.md) · [API specification](API.md) · [monetisation model](MONETISATION.md) · [Super Admin centre](ADMIN.md) · [build roadmap](ROADMAP.md) · [competitive framework](COMPETITIVE.md) · [master developer guide](DEVELOPER-GUIDE.md) · [forensic gap analysis](GAP-ANALYSIS.md).

## The Operator Journey

1. **Choose a game type.** The Forge Initiator offers a curated catalogue: mobile, web, 2D platformer, puzzle, fighting, racing, quiz, kids education, football/sports, card, zombie survival, tycoon, simulation, story adventure, and casino-style (excluding real-money gambling unless legally licensed and jurisdictionally cleared by the Compliance Agent).
2. **Describe the idea.** A single prompt is enough — e.g. *"a football penalty game where players compete online, unlock boots, buy stadiums, and sell player cards."*
3. **Receive the blueprint.** The Idea and Strategic agents return the title, category, core gameplay loop, target audience, levels, characters, monetisation model, asset list, technical complexity, estimated build cost, suggested selling price, and a commercial score — with three ranked variants.
4. **Select a package.** Fixed-price forge packages sit alongside ACU consumption (see [MONETISATION.md](MONETISATION.md)): Starter Game £19 · Playable Web Game £49 · Mobile-Ready Game £99 · Advanced Game with Marketplace £249 · Commercial Game Package £499+.
5. **The fleet builds.** Game files, assets, animations, menus, scoring, payment hooks, admin dashboard, player database, and marketplace page — per the Forge Protocol below.
6. **Publish or sell.** Play privately, publish on the JOSHRIX Marketplace, sell the template, licence the game, sell assets, offer paid access, export to web/mobile builds, embed as an iframe or PWA, invite players, or run tournaments.

### Creative Agent Structure → Production Fleet Mapping

The concept's ten creative agents are preserved as capabilities within the seven-agent production fleet:

| Creative Agent | Lives In | Notes |
|---|---|---|
| Game Idea Agent | Idea Agent | Genre detection, audience, market scoring, scope guarding, cost/time estimation |
| Game Design Agent | Strategic Agent | Full design document: rules, win/loss logic, controls, progression, shop logic, economy rules |
| Code Generation Agent | Code Agent | Prototype, engine logic, scoring, movement, enemy AI, save/load, DB + payment hooks, generated tests |
| Asset Creation Agent | Asset Agent | Characters, environments, UI, thumbnails — with strict IP protection: prompts and outputs are screened so operators cannot generate copyrighted characters or marks (e.g. Mario, Spider-Man, FIFA clubs, Disney characters) |
| Story & Dialogue Agent | Asset Agent (narrative sub-pipeline) | Storyline, missions, NPC dialogue, quest logic, tutorials, narration for story/RPG/education titles |
| Economy & Monetisation Agent | Economy Agent | Ads, IAP, paid download, subscription, battle pass, skins, coins, premium levels, resale, licensing, tournament entry, white-label |
| Marketplace Listing Agent | Deployment Agent | Sales page, description, screenshots, demo video script, pricing, licence terms, SEO, tags, buyer FAQ |
| Publishing Agent | Deployment Agent | Web play, mobile export, private links, embeddable iframe, PWA, app-store preparation, external engine export where possible |
| Quality Assurance Agent | QA Agent | Broken levels, missing assets, payment failure, crashes, unfair scoring, load speed, mobile responsiveness, security, copyright and age-rating risk |
| Revenue & Ownership Agent | IP Vault + Revenue Dashboard (svc-ip / svc-billing) | Creator/owner/buyer records, commission, earnings, licence types, resale rights, refunds, payouts, tax records |

## Marketplace Types

The marketplace trades five listing classes (the Epic Fab model proves the demand for game-asset ecosystems):

| Class | Examples | Licence Options |
|---|---|---|
| Full Games | Complete playable titles | Personal · Commercial · Exclusive sale · Non-exclusive sale · White-label |
| Game Templates | "Subway runner", "Football penalty", "Quiz game", "Restaurant tycoon" | Non-exclusive by default; buyer forges their own variant |
| Assets | Characters, maps, sound effects, animations, weapons, vehicles, UI packs | Per-asset commercial licence with provenance metadata |
| Game Mechanics | Leaderboard module, daily rewards, loot box*, inventory, multiplayer lobby, AI enemy system | Component licence; drops into any forge as a blueprint module (*loot boxes gated by jurisdiction compliance) |
| Game Services | Custom level design, reskinning, game improvement, trailer creation, publishing support | Service listings from advanced creators; escrowed via marketplace trust rails |

## Game Runtime Layer

Web-first runtimes are the Code Agent's primary build targets: **Phaser.js** for 2D titles and **Three.js** for lightweight 3D, compiled to web play, PWA, embeddable iframe, and mobile wrappers. Unity export integration and external-engine publishing are Phase 3+ paths (Unity's AI-workflow positioning makes it the natural first bridge). Creator payouts run on the BitriPay settlement engine with Stripe Connect as the fallback rail.

## The Killer Feature — Create → Play → Sell in One Flow

The user enters an idea. The AI builds the game. The user tests it. The AI creates the sales page. The user lists it. The platform earns; the creator earns. This single unbroken loop — idea to income without leaving the OS — is the commercial heart of the platform: the real money is not in helping users create games, it is in **owning the infrastructure where games are created, hosted, sold, upgraded, monetised, and resold**.

## The Forge Protocol — Five-Stage Neural Workflow

| Stage | Agent | Input | Output | Gate |
|---|---|---|---|---|
| 01 — Neural Synthesis | Idea Agent | Operator prompt; genre; market data | Validated concept brief; viability score; 3 variants | Operator approval (optional) |
| 02 — Blueprint Architecture | Strategic Agent | Concept brief; budget tier | Technical blueprint; economy model; ACU estimate | Operator approval (optional) |
| 03 — Parallel Production | Code Agent + Asset Agent (parallel) | Blueprint; tech spec; asset descriptors | Source code; asset pack; audio landscape | Automatic — merge to Economy Agent |
| 03b — Economy Design | Economy Agent | Code+Asset output; genre benchmarks | Full economy design; LTV projection; price architecture | Automatic — to QA |
| 04 — Rigorous Validation | QA Agent | Full forge output; compliance targets | QA certificate; bug catalogue; deployment token (or rejection) | Mandatory gate — token required for deployment |
| 05 — Global Deployment | Deployment Agent | Deployment token; build package; pricing config | Live CDN deployment; marketplace listing; IP registration | BitriPay checkout for listing fee (if applicable) |

## Platform Philosophy — The Sovereignty of Creation

JOSHRIX Studio was conceived from a single provocation: the distance between an idea and a commercial product has been effectively erased. The platform exists not merely to accelerate game production, but to democratise the infrastructure of IP creation and commercialisation. Every operator — whether a solo creator in Kinshasa, a micro-studio in Birmingham, or an enterprise publisher in London — deploys the same enterprise-grade intelligence fleet, the same IP sovereignty architecture, and the same global distribution infrastructure that was previously accessible only to organisations with millions in capital and dozens of specialists.

This is not a productivity tool. It is a transfer of commercial power to creators. The Autonomous Fleet does not merely generate — it protects, validates, commercialises, and deploys.

**JOSHRIX Studio. Own your code. Secure your assets. Forge your legacy.**

## Revenue Model

Value is captured at every layer of the stack: operator subscriptions, marketplace transaction fees, forge credit (ACU) consumption, IP licensing fees, white-label enterprise licensing, and API revenue. Every game forged strengthens the market intelligence layer — making every subsequent forge smarter, faster, and more commercially viable.
