# JOSHRIX Studio — Developer Build Roadmap

## Execution Roadmap v2 (creator-platform phases)

The refined phase structure for the creator platform (the month-based phases below remain as the platform-infrastructure view; both describe the same build):

| Phase | Target | Delivers |
|---|---|---|
| 0 — Foundation | 6–8 weeks | Product design system; identity; workspace; subscription; ACU ledger; project data model; AI gateway; agent-run framework; audit logging |
| 1 — Prompt-to-Playable MVP | 12–16 weeks | 2D web games; five controlled genres; JXSL v1; Blueprint, Code, Asset, Build, and QA agents; hosted preview; manual publishing |
| 2 — Creator Marketplace | — | Listings; licences; seller profiles; purchases; payouts; reviews; rights provenance; marketplace moderation; transaction ledger |
| 3 — Behaviour Intelligence | — | Runtime SDK; analytics; funnels; cohorts; synthetic player agents; difficulty analysis; churn prediction; recommendation engine |
| 4 — Mobile & Advanced Games | — | Android pipeline; 3D starter games; multiplayer framework; advanced mechanics; device performance profiles |
| 5 — Studio & Enterprise | — | Git integration; SSO; private agents; approval workflows; API; private deployment; data residency; white-label creator portals |

**Phase 1 exit criteria (hard gates):**
- At least 80% of supported generation requests produce a runnable prototype
- All builds run in isolated containers
- Every AI action is costed and logged
- Users can modify and rebuild projects

## Launch KPIs

| Category | Metrics |
|---|---|
| Creation | Time to first playable build · build success rate · cost per successful build · agent retry rate · user modification rate · project completion rate |
| Quality | Crash-free sessions · test pass rate · average quality score · marketplace rejection rate · refund rate |
| Creator economy | Active creators · published games · sellers earning revenue · creator GMV · marketplace conversion · repeat buyers · creator payout time |
| Player engagement | Day-one retention · day-seven retention · session completion · tutorial completion · level abandonment · player reports |
| Platform economics | Revenue per workspace · gross margin · AI cost as % of revenue · hosting cost per active game · marketplace take rate · payout liability · ACU breakage · refund reserve |

## Critical Acceptance Criteria

The platform is **not ready for commercial launch** unless:

1. Every generated build has a reproducible source version.
2. Provider costs and ACU charges are recorded per agent run.
3. Generated code runs inside isolated infrastructure.
4. Users can undo AI changes.
5. Every marketplace asset has provenance and licence data.
6. Payment and creator revenue are recorded in a financial ledger.
7. Public games pass minimum safety and quality gates.
8. Users can export their eligible project data.
9. The platform can suspend malicious games immediately.
10. Player analytics use consent-aware, privacy-respecting identifiers.
11. AI-generated recommendations state confidence and evidence.
12. No automated agent can publish, transfer rights, or spend beyond limits without authorisation.

## Minimum Launch Team

| Function | Roles |
|---|---|
| Product | Product director · game design lead · creator-economy product manager · UX/UI designer |
| Engineering | Technical architect · 2× full-stack engineers · game-engine engineer · AI/agent engineer · backend/platform engineer · DevOps engineer · QA automation engineer |
| Intelligence | Machine-learning engineer · data engineer · analytics engineer |
| Trust | Safety engineer · rights and licensing specialist · marketplace operations lead |
| Commercial | Creator partnerships · publisher partnerships · growth lead · customer success |

## Phase 1 — MVP (Months 1–4)

**Objective:** functional forge pipeline with the core six agents, operator onboarding, ACU billing, and the JOSHRIX Marketplace.

| Milestone | Scope |
|---|---|
| Infrastructure Setup | GCP project; PostgreSQL; Firestore; Redis; Cloudflare R2; Firebase Auth; CI/CD (GitHub Actions) |
| Agent Runtime | LangGraph orchestration; Idea, Strategic, Code, Asset, QA, Deployment agents (MVP capability) |
| Operator Portal | Registration; KYC (Sumsub); Forge Studio UI; IP Vault; basic analytics |
| BitriPay Integration | Subscription billing; ACU top-up; marketplace checkout; webhook handling |
| Marketplace | List, browse, purchase games and asset packs; licence delivery |
| Admin Centre | User management; forge monitoring; revenue dashboard; audit log |
| Security Baseline | MFA; JWT auth; API keys; HTTPS/TLS; basic WAF (Cloudflare) |

## Phase 2 — Beta (Months 5–8)

**Objective:** Economy Agent full deployment, Studio tier, team RBAC, API partner programme, and advanced analytics.

| Milestone | Scope |
|---|---|
| Economy Agent | Full monetisation loop designer; LTV modelling; economy balance simulation |
| Studio Features | Team RBAC; collaborative forge queue; studio analytics; IP attribution |
| API Programme | Developer portal; API key management; webhook engine; partner tier billing |
| Advanced Analytics | Forge ROI analysis; marketplace performance; cohort analysis; revenue forecasting |
| Governance Fleet | Fraud Detection, Compliance, Risk, and Revenue Optimisation agents |
| Mobile App | React Native operator app; forge monitoring; notifications; IP vault access |
| Performance | Load testing to 10K concurrent operators; CDN optimisation; query optimisation |

## Phase 3 — Commercial Launch (Months 9–12)

**Objective:** Enterprise tier, white-label OS, Education tier, data intelligence product, and global marketplace expansion.

| Milestone | Scope |
|---|---|
| Enterprise OS | White-label configuration; custom domain; branded agent fleet; SLA; dedicated infrastructure |
| Education Module | Supervised forge; IP assignment controls; instructor dashboard; institution billing |
| Data Intelligence | Anonymised market trend reports; publisher data subscriptions; genre intelligence API |
| IP Registry | On-chain IP provenance system; enhanced certificates; automated trademark monitoring |
| Marketplace Expansion | Third-party marketplace connectors (Steam, Itch.io, web3 marketplaces) |
| Self-Healing Platform | Auto-Repair, System Health, and Bug Detection agents fully deployed |
| SOC 2 Type II | Audit preparation; security controls documentation; penetration testing |

## Phase 4 — Global Scale (Month 13+)

- Multi-region deployment (EU, US, APAC, West Africa) with data residency controls
- African market expansion: deep BitriPay integration; local language support; African IP registry partnerships
- AI model fine-tuning: genre-specific Code Agent models; regional asset style models trained on forge history
- Reinforcement learning loop: Idea Agent and Economy Agent continuously improve on forge performance data
- JOSHRIX DAO: optional decentralised governance for marketplace revenue sharing and platform development votes
- B2B2C licensing: white-label JOSHRIX OS as an embedded service for hardware manufacturers, telcos, and education ministries
