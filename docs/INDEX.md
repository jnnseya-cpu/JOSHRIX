# JOSHRIX Studio — Complete Developer Product Document

> **Create Worlds. Build Games. Own the Future.**
> Developed under the working title *GameForge AI OS*; the product name is **JOSHRIX Studio**.

This index binds the documentation set into one complete, developer-ready product document. Each required section of the master specification maps to its authoritative location. Together these documents are sufficient for a senior engineering organisation to build the platform without additional business clarification.

| # | Required Section | Authoritative Location |
|---|---|---|
| 1 | Executive Product Vision | [PLATFORM.md](PLATFORM.md) — opening + Platform Philosophy; [PRODUCT-PRINCIPLES.md](PRODUCT-PRINCIPLES.md) — positioning, five layers, principles, segments |
| 2 | Market Gap Deep Review | [COMPETITIVE.md](COMPETITIVE.md) — landscape + unserved gaps; [GAP-ANALYSIS.md](GAP-ANALYSIS.md) §C |
| 3 | Complete User Ecosystem | [PLATFORM.md](PLATFORM.md) — User Ecosystem (9 user types) |
| 4 | AI-Agent Command Centres (every user type) | [PLATFORM.md](PLATFORM.md) — Operator Command Centre; [ADMIN.md](ADMIN.md) — Super Admin; [GAP-ANALYSIS.md](GAP-ANALYSIS.md) §E2 — unified assistant runtime with per-tier capability packs (Chief of Staff, Analyst, Research, Automation, Growth, Security, Knowledge) |
| 5 | Core AI Agents (production + governance + operational) | [PLATFORM.md](PLATFORM.md) — seven-agent Production Fleet with inputs/outputs/triggers/APIs/business value; Governance Fleet; [AGENT-ARCHITECTURE.md](AGENT-ARCHITECTURE.md) — hierarchical operating model, executive agents, division specialists; [INTELLIGENCE.md](INTELLIGENCE.md) — self-managing platform fleet |
| 6 | Full Platform Modules | [PLATFORM.md](PLATFORM.md) — Platform Modules incl. Forge Studio spec |
| 7 | BitriPay Payment Gateway API Door | [PLATFORM.md](PLATFORM.md) — BitriPay integration architecture + Merchant Portal spec; [API.md](API.md) — webhook events; [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) §10 |
| 8 | Third-Party API Connectors | [CONNECTORS.md](CONNECTORS.md) — full category catalogue with providers, data flows, and the adapter contract |
| 9 | Production-Grade Architecture | [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — services, events, state machine, agent runtime, environments; [PLATFORM.md](PLATFORM.md) — stack tables; [INTELLIGENCE.md](INTELLIGENCE.md) — data intelligence layer |
| 10 | Database Schema + ERD | [DATA-MODEL.md](DATA-MODEL.md) — tables, indexes, ERD; [GAP-ANALYSIS.md](GAP-ANALYSIS.md) §A1 — double-entry ledger upgrade |
| 11 | API Specification | [API.md](API.md) — endpoints, auth, rate limits, request/response examples, error codes, webhooks |
| 12 | Monetisation Model | [MONETISATION.md](MONETISATION.md) — ACU economy, plans, ten revenue streams; [GAP-ANALYSIS.md](GAP-ANALYSIS.md) §C2–C3 — Spark free tier + LiveOps annuity; [INTELLIGENCE.md](INTELLIGENCE.md) — dynamic pricing, CLV, churn, upsell engines |
| 13 | Security, Compliance & Risk | [SECURITY.md](SECURITY.md) — Zero Trust, anti-hacking framework, four-state data protection, compliance standards, fraud architecture; [GAP-ANALYSIS.md](GAP-ANALYSIS.md) §D — supply chain, audit chain, policy enforcement, IP claims |
| 14 | Admin Super Control Centre | [ADMIN.md](ADMIN.md) — ten modules with visibility + actions |
| 15 | Developer Build Roadmap (MVP → Global Scale) | [ROADMAP.md](ROADMAP.md) — four phases; [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) §12 — Phase 1 build order |
| 16 | Competitive Advantage | [COMPETITIVE.md](COMPETITIVE.md) — seven moats + three-sided market dynamics |
| 17 | Production Readiness (testing, deployment, DR, observability) | [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) §7–§11 — CI/CD, testing strategy, SLOs, failure modes & self-healing; [GAP-ANALYSIS.md](GAP-ANALYSIS.md) — priority matrix as the readiness review |
| — | User Journeys & Agent Workflows | [PLATFORM.md](PLATFORM.md) — Operator Journey (game-type catalogue → prompt → blueprint → forge) + Forge Protocol five-stage workflow |
| — | MVP Application Build Spec | [APP-BUILD-SPEC.md](APP-BUILD-SPEC.md) — collections, app routes, dashboards, security checklist; working prototype at [../frontend/studio.html](../frontend/studio.html) |
| — | Ultra-Realism & 3D Output Pipeline | [REALISM-PIPELINE.md](REALISM-PIPELINE.md) — 3D-by-default output contract, asset generation chains, engine profiles, Visual Fidelity QA gate, media-provider keys |
| — | Deployment Architecture | [DEPLOYMENT.md](DEPLOYMENT.md) — Hostinger DNS + Vercel + Firebase + Cloud Run |
| — | Brand | [../branding/BRANDING.md](../branding/BRANDING.md) + [logo](../branding/logo.svg) + [landing page](../frontend/index.html) |

## Reading Order for a New Engineering Team

1. [PLATFORM.md](PLATFORM.md) — what we are building and why
2. [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — how it is built
3. [GAP-ANALYSIS.md](GAP-ANALYSIS.md) — what must be hardened, in what order
4. [DATA-MODEL.md](DATA-MODEL.md) + [API.md](API.md) — the contracts
5. [SECURITY.md](SECURITY.md) + [CONNECTORS.md](CONNECTORS.md) + [INTELLIGENCE.md](INTELLIGENCE.md) — the surrounding systems
6. [MONETISATION.md](MONETISATION.md) + [COMPETITIVE.md](COMPETITIVE.md) + [ROADMAP.md](ROADMAP.md) + [ADMIN.md](ADMIN.md) — the business machine
