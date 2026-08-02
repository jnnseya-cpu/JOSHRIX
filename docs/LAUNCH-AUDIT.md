# JOSHRIX Studio — Production Launch Audit

**Release candidate:** `6f0dc5d` · build `2026-08-02.65`
**Environment tested:** repository at HEAD, executed locally (production URL unreachable from the audit environment — see §4)
**Test period:** 2 August 2026
**Auditor role:** adversarial production-launch authority (engineering, security, payments, data, AI, operations)

---

## 1. Executive verdict

**NO-GO for unrestricted public launch. CONDITIONAL GO for a closed, invite-only beta** under the restrictions in §16.

**Launch confidence: 68/100** (up from 61 before the fixes in this audit).
**Overall risk: HIGH** — concentrated in one place, and it is not the code.

The engineering substrate is stronger than a week of visible failure suggests. Billing is metered correctly at 4× provider cost, the double-entry ledger mathematically refuses to go unbalanced, Stripe webhooks verify signatures on the raw body and are idempotent, admin surfaces fail closed, and adversarial input testing found no injection, no secret leakage and no cross-user data exposure. Seven defects were found during this audit; six were fixed and regression-tested here.

The blocking problem is the product itself: **in seven days of operation the platform has not produced a single game the owner considers sellable.** Every intermediate failure mode has now been diagnosed, instrumented and eliminated — blank screens, dead START buttons, silent provider failures, truncated code, unrendered 3D — but the remaining question, whether generation quality clears a commercial bar, is unanswered. A platform whose core promise is unproven cannot launch publicly regardless of how sound its plumbing is.

---

## 2. Immediate launch blockers

| ID | Sev | Area | Defect | Impact | Status |
|---|---|---|---|---|---|
| P20-01 | **P1** | Fraud / denial-of-wallet | `POST /api/wallet-init` with an empty body minted unlimited wallets each holding 2,000 spendable ACUs — no auth, no identity, no rate limit | Proven: 10 requests = 10 funded wallets ≈ 620 forges ≈ **$62** of provider spend; 1,000 wallets ≈ **$6,200**. Directly violated the platform's "no free AI" rule | **FIXED** |
| P9-09 | **P2** | Financial | `marketplaceSplit` returned a **negative** creator payout below 27p; the schema accepted prices from 1p | A creator selling at 25p would be **charged 1p** for the sale | **FIXED** |
| P5-06 | **P2** | Authorisation | Studio gate accepted any profile with displayName **OR** handle **OR** email | A hand-written `localStorage` entry reached the Studio | **FIXED** |
| P9-12 | **P2** | Financial | `charge.refunded` did not reclaim ACUs — flagged for manual action only | Refunded customer kept spendable AI credit; platform pays the provider bill for compute it was never paid for | **FIXED** |
| P9-11 | **P1** | Financial | `/api/checkout` was `mode:"demo"`; price came from the buyer's request | Marketplace purchases did not exist; had it shipped, buyers could set their own price | **FIXED** |
| P9-10 | **P1** | Financial | `/api/payout` was `mode:"demo"` with no earnings check | Creators could not withdraw; endpoint returned a success shape for work never done | **FIXED (to the rail boundary)** |
| **P2-01** | **P1** | **Product** | **Core journey unproven — no sellable game produced in 7 days** | **The platform's entire value proposition is unverified** | **OPEN** |
| P18-01 | P1 | Disaster recovery | Backups never restored; rollback never drilled | An unrecoverable incident is possible | **NOT TESTED** |
| P16-01 | P2 | Observability | No alerting, no on-call owner, no runbook | Failures are diagnosable after the fact but nobody is told | **OPEN** |

---

## 3. Mandatory launch gates

| Gate | Status | Evidence | Residual risk |
|---|---|---|---|
| 1 · Build integrity | **PASS** | 40 API modules + 7 shared modules compile clean (`tsc` exit 0); HEAD traceable to commit | No CI enforcing this on push |
| 2 · Critical functionality | **FAIL** | Games render and bill correctly; none judged sellable in 7 days | The launch blocker |
| 3 · Security | **PASS** | 30/31 adversarial assertions pass; admin endpoints fail closed with the key unset; no secrets in source; no stored XSS | Live headers unverified (§4) |
| 4 · Data integrity | **PARTIAL** | `postTx` refuses unbalanced postings; entitlements and refunds single-use; 8-way concurrency race yields exactly one winner | **Backup restore never tested** |
| 5 · Financial integrity | **PASS (code) / PARTIAL (operational)** | Signature verification on raw body; idempotency via `claimEvent`; server-side price authority; clawback, entitlement and payout reservation all single-use | Stripe Connect not onboarded; no live payment executed |
| 6 · Performance | **NOT TESTED** | — | Unknown behaviour under concurrent load |
| 7 · Reliability | **PASS** | 3-provider chain with per-provider error capture; parse gate; engine fallback; dual-channel delivery; auto-refund on render failure | Gemini account is 403 — one provider down |
| 8 · Observability | **PARTIAL** | `/api/forge-log` records every forge with per-provider failure reasons — genuinely good | No alerts, no on-call, no tracing |
| 9 · Privacy | **PARTIAL** | Policy pages present; wallet deletion implemented for testers | Deletion not verified across Firebase/analytics/backups |
| 10 · Operational readiness | **FAIL** | Admin desks exist (moderation, wallets, payouts) | No runbook, no incident owner, no tested rollback |

---

## 4. Testing coverage and limits

**Executed:** 94 automated assertions across 7 suites (committed under `tests/`), plus a 31-page browser crawl, mobile-viewport checks, and an auth-gate matrix.

| Suite | Assertions | Result |
|---|---|---|
| Economics / billing math | 13 | 13 pass |
| Payments & ledger invariants | 24 | 24 pass |
| Security (authz, validation, leakage) | 31 | 30 pass, 1 informational |
| Wallet abuse regression | 16 | 16 pass |
| Refund clawback | 7 | 7 pass |
| Marketplace price authority | 11 | 11 pass |
| Payout authority & concurrency | 13 | 13 pass |

**BLOCKED — not tested, not passed.** The audit environment cannot reach `joshrix.com` (network policy). The following are unverified and must not be read as passing:

- live production endpoints and response headers
- real Stripe payment, refund, chargeback or subscription lifecycle
- load, stress, soak, or any latency measurement
- backup restoration and rollback
- cross-browser (Safari, Firefox, Edge), screen readers, keyboard-only journeys
- email/SMS delivery and inbound webhooks
- Firebase authorised-domain and security-rule configuration

---

## 5. Architecture

Vercel serverless (40 API functions, 300s max on forge paths) · Neon Postgres ledger · Firebase Auth · Stripe payments · three AI providers in a fallback chain · 31 static pages · 135 self-hosted GLB models.

**Single points of failure:** Neon (no read replica); Vercel region; **OpenAI is currently the only working AI provider** (Gemini 403, Claude truncates at 3D size); the `MODERATION_KEY` is the only admin credential and is shared, not per-operator.

---

## 6. Security findings

No P0 or P1 security findings remain open.

- **PASS** — admin endpoints refuse missing, wrong and empty keys, and **fail closed when `MODERATION_KEY` is unset** (the classic inversion bug is absent).
- **PASS** — no secrets in version control. The Firebase web key in `assets/config.js` is public by design.
- **PASS** — error responses leak no stack traces, internal paths, connection strings or keys.
- **PASS** — no stored XSS: `index.html` escapes remote titles, `play.html` uses `textContent`.
- **P4 (accepted)** — `studio.html` renders server error strings via `innerHTML`; worst case is self-XSS in the creator's own browser.

---

## 7. Financial findings

Reconciliation difference across all tested flows: **zero**. Every posting set sums to zero; value is conserved through every split at every accepted price on all three rails, with and without lineage royalty.

Fixed in this audit: negative creator payouts, buyer-controlled pricing, absent refund clawback, unverified withdrawals, and unlimited free credit.

**Remaining gap:** money cannot yet leave the platform. `/api/payout` reserves earnings and queues an operator-reviewed request; executing the transfer requires Stripe Connect onboarding with recipient KYC — owner configuration, deliberately not faked.

---

## 8. AI subsystem findings

Measured from the production forge log:

| Provider | Behaviour |
|---|---|
| OpenAI | Completes full-size builds, ~40s. Currently carrying the platform. |
| Claude | Truncates at 3D size (`no closing </html>`), ~190s wasted per attempt |
| Gemini | `HTTP 403 — Your project has been denied access` (account-side) |

Defences now in place: per-provider error capture, server-side parse gate (broken code burns to the next provider, never to the screen), canvas-append check, 3D fidelity floor, whole-chain time budget, engine fallback, and automatic refund on client-side render failure.

**Not measured:** task success rate, hallucination rate, cost per *successful* game. **This is the gap behind blocker P2-01** — there is no evaluation set, so "is the output good enough to sell" has no number attached to it.

---

## 9. Required pre-launch actions

**Before any launch**
1. Produce and play one game judged sellable — the only test that matters (owner + engineering)
2. Restore a Neon backup into an isolated database and verify record counts (DBRE)
3. Execute one real Stripe payment, one refund, and confirm the ACU clawback fires (payments)
4. Perform a deployment rollback and verify the restored state (release)

**Before invite-only beta**
5. Restore Gemini API access, or accept single-provider dependency in writing
6. Add error alerting with a named on-call owner
7. Rate-limit `wallet-init`, `forge-game` and `topup` by IP

**Before public launch**
8. Complete Stripe Connect onboarding so payouts can execute
9. Load-test the forge path at expected concurrency and record p95
10. Build an AI evaluation set and publish task-success and cost-per-success figures
11. Verify data deletion across Firebase, analytics and backups
12. Cross-browser and screen-reader passes on the critical journey

---

## 10. Launch configuration (if a restricted beta proceeds)

**Enable:** Studio forge (2D and 3D), wallet top-up, arcade, play. **Disable:** marketplace checkout and payouts until §9.3 and §9.8 are complete. **Limit:** invite-only; ≤50 creators; daily per-wallet forge cap; alert on daily AI spend above a set threshold. **Kill switch:** unset provider API keys — the engine fallback keeps games playable while all AI generation stops.

---

## 11. Final decision

**This release is not approved for public launch.** It is approved only for a restricted, invite-only beta under the conditions in §10, and only once the four "before any launch" actions in §9 are complete and evidenced.
