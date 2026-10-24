# The eleven mandatory gates — commit e9c5487, 24 Oct 2026

Statuses are PASS, PASS WITH NON-BLOCKING ISSUES, BLOCKED (a real defect), or
UNTESTABLE HERE (no access to execute it). **UNTESTABLE is not a pass and must
never be reported as one.** Six gates are untestable from this environment.

| # | Gate | Status | Evidence / why |
|---|---|---|---|
| 1 | Build integrity | **PASS** | Clean install; `tsc --noEmit` under `strict: true` clean; 47 test files, 1,943 assertions, three consecutive green full-suite runs; `npm audit` zero vulnerabilities; one lockfile; build traceable to `e9c5487` |
| 2 | Truth & fitness for purpose | **BLOCKED** | The public surface is honest and test-guarded, but the core promise is unproven: no forge run has produced a build the owner judged good. A platform whose central claim has never been demonstrated cannot pass a fitness gate |
| 3 | Critical functionality | **PARTIAL / UNTESTABLE** | The three reference games are verified playable in a real browser, start to finish, including at phone size. Signup, wallet, forge, publish, moderation and purchase all require a database and keys |
| 4 | Security | **PASS WITH NON-BLOCKING ISSUES** | No open P0/P1 found in code. Secret scan across full git history clean apart from one documented, rotated historical credential. Firestore rules versioned and least-privilege. Authz is server-side with per-wallet ownership checks. Not penetration-tested against a running deployment, so this is a code-level pass only |
| 5 | Data integrity | **UNTESTABLE HERE** | Double-entry ledger, idempotent webhooks and atomic transitions are implemented and unit-tested against an in-memory stand-in. No Neon access, so no migration-on-real-data test and **no restore drill**. An unrestored backup is not a backup |
| 6 | Financial integrity | **UNTESTABLE HERE** | Server-authoritative pricing, 4× metering, charge-on-accept and webhook idempotency are implemented and covered by t1, t2, t21, t31, t36. Zero real payments have ever run. No ledger-difference report can be produced without the database |
| 7 | Performance | **UNTESTABLE HERE** | No load test has been run against any deployment. No p95 figure exists. Claiming this gate would be fabrication |
| 8 | Reliability | **PARTIAL** | Three-provider AI fallback, bounded retries, forge jobs that survive process death, and graceful degradation are implemented and tested in logic. Dependency failure injection against a live system has not been run. **Rollback has never been executed** |
| 9 | Observability | **BLOCKED** | There is no error monitoring. The first production failure reaches the owner through a complaint. Structured logging and a forge log exist; alerting does not |
| 10 | Privacy & compliance | **PARTIAL** | Data map is small and documented; Firestore holds profile data only, money lives in Postgres. A real deletion request has never been executed end to end across database, auth, storage and email platform |
| 11 | Operational readiness | **BLOCKED** | No incident process, no runbook, no on-call, no tested backup, and payouts still leave by hand because Stripe Connect onboarding is incomplete |

## Score

Deliberately not issued. The brief weights fourteen categories, and nine of them
depend on evidence this environment cannot produce. A number computed from five
testable categories and six guesses would look like rigour and be the opposite.

## Verdict

**NO-GO.** Gates 2, 9 and 11 are blocked on work that is not code. Gates 5, 6, 7
and 10 cannot be executed without credentials and a deployment. No unrestricted
launch is defensible, and a conditional launch is not either until gate 2 clears,
because the restriction that would make it safe is "do not let anyone use the
forge", which is the product.
