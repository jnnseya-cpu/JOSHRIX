# JOSHRIX Studio — Master Developer Build Document

> Production-grade engineering specification for building the JOSHRIX AI Operating System.
> Companion documents: [PLATFORM.md](PLATFORM.md) (what we're building), [SECURITY.md](SECURITY.md), [DATA-MODEL.md](DATA-MODEL.md), [API.md](API.md), [MONETISATION.md](MONETISATION.md), [ADMIN.md](ADMIN.md), [ROADMAP.md](ROADMAP.md), [COMPETITIVE.md](COMPETITIVE.md).

This document is the build contract: service decomposition, event contracts, the forge state machine, repository layout, environments, CI/CD, testing, observability, model routing, metering, and failure handling. It is written so a team (or an agentic coding environment) can start Phase 1 without further architectural decisions.

## 1. System Decomposition — Service Inventory

Every service is a NestJS microservice in the monorepo, deployed to Cloud Run, communicating via Pub/Sub events and internal gRPC (mTLS via Istio). No service reaches into another service's database.

| Service | Owns (data) | Responsibilities | Sync API | Emits |
|---|---|---|---|---|
| `svc-identity` | operators, api_keys, sessions | Registration, login, MFA, JWT issuance, API key lifecycle, device fingerprinting | `/operators/*`, `/auth/*` | `operator.created`, `operator.kyc_changed` |
| `svc-forge` | forge_cycles, agent_logs | Forge lifecycle state machine, approval gates, ACU estimation, orchestrator hand-off | `/forge/*` | `forge.initiated`, `forge.stage_completed`, `forge.completed`, `forge.failed`, `forge.cancelled` |
| `orchestrator` | forge session state (Firestore) | LangGraph DAG execution, agent spawning on Cloud Run jobs, retry/fallback, tool-registry enforcement | internal gRPC only | `agent.started`, `agent.completed`, `agent.failed` |
| `svc-ip` | ip_records, licence_assignments | IP registration, certificate generation, on-chain anchoring, trademark pre-clearance queries | `/ip/*` | `ip.registered`, `ip.licence_assigned` |
| `svc-marketplace` | marketplace_listings, marketplace_purchases | Listings, search indexing (Algolia sync), purchase flow, licence delivery | `/marketplace/*` | `listing.created`, `purchase.completed` |
| `svc-billing` | subscriptions, plans, transactions, acu_ledger | BitriPay/Stripe integration, subscription lifecycle, ACU metering and ledger, settlement | `/subscriptions/*`, `/operators/me/acu*` | `acu.debited`, `acu.credited`, `subscription.changed`, `payment.*` (re-emitted from gateway webhooks) |
| `svc-webhooks` | webhooks, webhook_deliveries | Partner webhook registration, HMAC signing, delivery with exponential backoff, dead-letter handling | `/webhooks/*` | `webhook.delivery_failed` |
| `svc-compliance` | compliance_flags, audit_log (writer) | KYC/AML orchestration (Sumsub/ComplyAdvantage), flag lifecycle, GDPR erasure workflow, audit ingestion | `/admin/compliance/*` | `compliance.flag_raised`, `compliance.flag_resolved` |
| `svc-analytics` | BigQuery datasets | Event ingestion to BigQuery, operator-facing analytics queries, revenue aggregation | `/analytics/*` | — |
| `svc-admin` | — (reads via service APIs) | Super Admin Centre backend-for-frontend; privileged actions with dual-control on destructive ops | `/admin/*` | `admin.action_taken` |
| `gateway` | — | Kong: authn (JWT/API key), rate limiting per key/tier, routing, request_id injection | edge | — |

**Governance fleet agents** (fraud, compliance, risk, revenue-optimisation, support, marketing, system-health, bug-detection, auto-repair, AI-governance) are not services — they are scheduled or event-triggered Cloud Run jobs owned by the domain service closest to their data (e.g. Fraud Detection Agent is owned by `svc-billing`; System Health + Auto-Repair by the platform SRE stack).

## 2. Event Contracts

Transport: Google Pub/Sub, one topic per event family (`forge`, `billing`, `marketplace`, `compliance`, `agent`). All events share an envelope; consumers must tolerate unknown fields (forward compatibility) and dedupe on `event_id` (at-least-once delivery).

```json
{
  "event_id": "evt_01J8...",           // ULID, idempotency key
  "event_type": "forge.stage_completed",
  "occurred_at": "2026-07-26T13:00:00Z",
  "actor": { "type": "agent", "id": "code-agent" },
  "resource": { "type": "forge_cycle", "id": "frg_01J8..." },
  "payload": { "stage": "code", "acu_consumed": 212, "output_ref": "gs://forge-output/frg_01J8/code/" },
  "trace_id": "..."                     // W3C traceparent, propagated end-to-end
}
```

Rules:
- Events are facts, not commands. Services never instruct each other via events; they react.
- Large artifacts never ride in events — payloads carry GCS/R2 references (`output_ref`).
- Every event handler is idempotent. The `event_id` is stored in a per-consumer `processed_events` table with a 30-day TTL.
- Schema evolution is additive-only; a breaking change requires a new `event_type` version suffix (`forge.stage_completed.v2`).

## 3. The Forge State Machine

`svc-forge` owns the canonical state; the orchestrator executes it. States are persisted on `forge_cycles.status`; every transition is an audit_log entry and a `forge.*` event.

```
DRAFT → ESTIMATING → AWAITING_PAYMENT? → QUEUED → SYNTHESIS (Idea)
  → [GATE: concept_approval?] → BLUEPRINT (Strategic)
  → [GATE: blueprint_approval?] → PRODUCING (Code ∥ Asset)
  → ECONOMY (Economy) → VALIDATING (QA)
  → { QA pass → [GATE: predeploy_approval?] → DEPLOYING (Deployment) → COMPLETED }
  → { QA fail → REMEDIATION (bounded retries: 2) → VALIDATING | FAILED }
Terminal: COMPLETED | FAILED | CANCELLED
```

- **Gates** are per-operator configuration (`approval_gates` on the forge request). A gate parks the cycle in `AWAITING_APPROVAL{stage}` with a 7-day expiry → auto-`CANCELLED` with partial ACU refund.
- **ACU metering**: the orchestrator reports per-agent consumption on each `agent.completed`; `svc-billing` writes the `acu_ledger` delta atomically with a balance check. If balance would go negative mid-forge, the cycle parks in `AWAITING_TOPUP` (24h expiry) rather than failing.
- **Cancellation** refunds unconsumed estimated ACU; consumed ACU is non-refundable.
- **Concurrency**: per-plan concurrent-cycle limits enforced at `QUEUED` admission by `svc-forge`, not the orchestrator.

## 4. Agent Runtime Standards

Each production agent is a container with a uniform contract:

- **Input**: a signed `AgentTask` document (task_id, forge_id, stage inputs as GCS refs, tool registry, budget: max ACU, max wall-clock).
- **Output**: an `AgentResult` (status, output refs, acu_consumed, structured logs, self-reported quality metrics). Written to GCS, referenced in `agent.completed`.
- **Tool registry**: the ONLY external calls an agent may make are those listed in its registry entry (API allowlist + per-tool rate/spend caps), enforced by an egress proxy sidecar — not by prompt instructions. Violations kill the task and raise `compliance.flag_raised(type=agent_boundary)`.
- **Model routing**: agents request a capability tier, not a model. The router maps tier → provider using config, with automatic failover:
  | Tier | Primary | Fallback | Used by |
  |---|---|---|---|
  | `reasoning-max` | Claude (latest flagship) | GPT-4o | Strategic, QA (IP risk) |
  | `codegen` | Claude Code-optimised | GPT-4o | Code Agent |
  | `fast-structured` | Claude Haiku-class | Gemini Flash | Idea variants, metadata, tagging |
  | `image` | SDXL (self-hosted) | DALL-E 3 | Asset Agent |
  | `audio` | ElevenLabs / Suno | Mubert | Asset Agent |
- **Determinism discipline**: every agent run records prompt template version, model id, temperature, and input hashes in `agent_logs` — any forge output must be explainable and reproducible to the extent the models allow.
- **Retries**: transient failure → up to 2 retries with jittered backoff on the same provider, then fallback provider, then `agent.failed`. The orchestrator decides whether a stage failure is fatal (QA, Deployment) or degradable (one asset sub-batch).

## 5. Repository & Code Layout

Single monorepo (`joshrix-os`), pnpm + Turborepo:

```
apps/
  web/                Next.js 14 operator portal + marketplace (App Router, RSC)
  mobile/             React Native + Expo operator app
  admin/              Next.js Super Admin Centre (separate deployment, separate auth realm)
services/
  identity/  forge/  orchestrator/  ip/  marketplace/  billing/
  webhooks/  compliance/  analytics/  admin-bff/
agents/
  idea/  strategic/  code/  asset/  economy/  qa/  deployment/
  governance/<agent>/
packages/
  contracts/          Event schemas (zod), API DTOs, OpenAPI spec — the single source of truth
  db/                 Prisma schema + migrations (PostgreSQL)
  auth/               JWT/key verification, RBAC guards
  telemetry/          Logger, tracing, metrics wrappers
  ui/                 Shared Tailwind + Radix component library
infra/
  terraform/          GCP, Cloudflare, Algolia, Pinecone as code — no console clicking
  k8s/                Istio mesh config for GKE-hosted components (Kafka, SDXL inference)
```

Conventions: TypeScript strict everywhere; contracts package is the only place DTOs/event types are defined (services import, never redeclare); DB access only through the owning service; migrations reviewed like code and always backward-compatible for one release (expand-migrate-contract).

## 5b. Creator-Surface Toolkit

The operator portal's creation surfaces use: **React Flow** for agent and logic graphs, **Monaco Editor** for source editing, **PixiJS/Phaser** in-browser 2D preview and **Three.js** 3D preview, and **WebSockets** for live build updates. Reliable job execution uses **Cloud Tasks** alongside Pub/Sub where at-least-once with per-task retry policy is needed. Firestore holds collaboration and project metadata only — **complex financial ledgers must never live solely in Firestore**; all money records are PostgreSQL double-entry postings (§10, GAP-ANALYSIS §A1).

## 6. Environments & Configuration

| Env | Purpose | Data | Payments |
|---|---|---|---|
| `local` | Docker Compose: Postgres, Redis, Pub/Sub emulator, Firestore emulator, fake model router (canned outputs) | Seeded fixtures | BitriPay sandbox |
| `dev` | Shared GCP project, auto-deployed from `main` | Synthetic | BitriPay sandbox |
| `staging` | Production mirror, release candidates, load tests | Anonymised production sample | BitriPay sandbox |
| `prod` | Multi-region (Phase 4): eu-west, us-east, africa-west | Real, residency-partitioned | Live |

- All configuration via environment + GCP Secret Manager; no secrets in code or CI logs. API keys rotate every 90 days (enforced by `svc-identity` job).
- The **fake model router** in `local`/CI returns recorded agent outputs so the full forge pipeline is testable for pennies and deterministically.
- Feature flags (per-tier and per-operator) via a `flags` table + Redis cache — gates every Phase 2+ capability so trunk-based development stays deployable.

## 7. CI/CD

GitHub Actions, trunk-based:

1. **PR**: lint, typecheck, unit tests, contract tests (zod schemas ↔ OpenAPI diff), affected-package build (Turborepo), Prisma migration dry-run, SAST (Semgrep) + dependency audit.
2. **Merge to main**: build containers (distroless, SBOM attached), deploy to `dev`, run smoke forge (full pipeline against fake router).
3. **Release tag**: deploy `staging`, run e2e suite + a real-model canary forge (budget-capped), k6 load baseline, then progressive rollout to `prod` via Cloud Run revisions (10% → 50% → 100%, auto-rollback on SLO burn).
4. **Migrations** run as a separate gated job before service rollout; contract phase of expand-migrate-contract ships only after one full release soak.

## 8. Testing Strategy

| Layer | Tooling | Non-negotiables |
|---|---|---|
| Unit | Vitest/Jest | ACU ledger math, state machine transitions, HMAC signing, fraud scoring thresholds |
| Contract | zod + OpenAPI diff in CI | Any event/DTO change breaking a consumer fails the PR |
| Integration | Testcontainers (Postgres/Redis/Pub/Sub emulator) | Forge happy path + every gate/expiry/refund branch; webhook retry + dead-letter |
| E2E | Playwright against staging | Register → KYC (sandbox) → subscribe → forge → approve gates → marketplace listing → purchase → payout |
| Agent evals | Golden-set eval harness per agent | Each agent PR runs its eval set (e.g. QA Agent must catch 100% of seeded IP-risk fixtures; Code Agent output must compile and pass generated tests) |
| Load | k6 | 10K concurrent operators browsing, 500 concurrent forge cycles, marketplace search p95 < 300ms |
| Chaos | staging-only fault injection | Kill an agent mid-stage → cycle resumes or refunds correctly; Pub/Sub duplicate storm → no double ACU debit |

## 9. Observability & SLOs

- **Tracing**: OpenTelemetry everywhere; `trace_id` flows from HTTP edge through Pub/Sub attributes into agent containers — one trace per forge cycle end-to-end.
- **Logs**: structured JSON, PII-redacted at source; agent prompts/outputs logged as GCS refs, never inline.
- **Metrics/SLOs** (Datadog):
  | SLO | Target | Alert burn |
  |---|---|---|
  | API availability (gateway) | 99.9% monthly | 2% budget/1h |
  | Forge cycle success (non-operator-fault) | ≥ 97% | 5 failures/15min |
  | Forge p95 wall-clock (starter tier) | < 4h | trend alert |
  | Marketplace search p95 | < 300ms | 5min sustained |
  | Webhook delivery within 60s | 99% | backlog > 1k |
  | ACU ledger drift (metered vs billed) | 0 | any nonzero — page immediately |
- **Cost observability**: per-forge model spend attributed to `forge_id` (the router tags every provider call); daily job reconciles provider invoices against `acu_ledger` — this is the margin dashboard for MONETISATION.md's 60–70% ACU target.

## 10. Payments Integration (BitriPay-first)

- All money flows through `svc-billing`. BitriPay checkout sessions are created server-side; the client only ever receives a session URL.
- Gateway webhooks land on a dedicated endpoint verified by HMAC + IP allowlist, are persisted raw, then re-emitted as internal `payment.*` events — internal consumers never depend on gateway-specific payloads (Stripe fallback slots in behind the same internal events).
- Settlements, refunds, and commission splits are ledgered double-entry in `transactions`; marketplace revenue splits (platform/operator/licensor) are computed at purchase time and stored immutably on the purchase record.
- Failure policy: `payment.failed` on subscription → 7-day grace with banner + email (SendGrid), then downgrade workflow; forge `AWAITING_PAYMENT`/`AWAITING_TOPUP` expiries per §3.

## 11. Failure Modes & Self-Healing

| Failure | Detection | Automated response |
|---|---|---|
| Model provider outage | Router error-rate breaker | Failover to fallback provider; `agent.degraded` annotation on forge report |
| Agent stuck (no heartbeat 10min) | Orchestrator watchdog | Kill container, retry per §4; refund stage ACU if terminal |
| Pub/Sub consumer lag | Queue depth metric | Cloud Run max-instances raise (System Health Agent); page if > 15min |
| Bad deploy | SLO burn during rollout | Auto-rollback to previous revision (Auto-Repair Agent executes) |
| Regional outage (Phase 4) | Health probes | DNS failover for stateless tier; forge cycles resume from last persisted stage in-region on recovery — cycles are never silently lost |
| Ledger discrepancy | Nightly reconciliation | Freeze affected operator billing actions, page finance + on-call |

## 12. Build Order (maps to ROADMAP.md Phase 1)

1. `packages/contracts` + `packages/db` (schema from DATA-MODEL.md) — everything depends on these.
2. `svc-identity` + gateway auth + operator registration/KYC sandbox.
3. `svc-billing` skeleton: plans, BitriPay sandbox subscription, ACU ledger (no forge yet — sell credits before spending compute).
4. `svc-forge` state machine + orchestrator with fake agents (canned outputs) — full pipeline walkable end-to-end in `local`.
5. Real agents in order of risk: Idea → Strategic → Code → Asset → QA → Deployment (each behind a flag, each with its eval set).
6. `svc-ip` + `svc-marketplace` + operator portal surfaces.
7. `svc-admin` + audit trail + security baseline hardening.
8. Beta gate: load test, chaos suite, pen test, then Phase 2.

---

**JOSHRIX Studio. Own your code. Secure your assets. Forge your legacy.**
