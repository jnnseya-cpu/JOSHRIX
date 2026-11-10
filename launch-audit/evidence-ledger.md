# Evidence ledger — cycle 1, commit e9c5487, 24 Oct 2026

Every check actually executed in this cycle. A row with no command was not run,
and is marked UNTESTABLE rather than inferred.

| ID | Check | Command | Result |
|---|---|---|---|
| A-01 | Access probe | env probe + `curl /api/health` | repo+terminal only; DB, AI, Stripe, SMTP, admin key ABSENT; deployment HTTP 000 unreachable |
| B-01 | Strict type check | `npm run typecheck` (`tsc --noEmit`, `strict: true`) | PASS, zero errors |
| B-02 | Full suite, run 1 | `node tools/run-tests.mjs` | PASS 47 files, 1,943 assertions |
| B-03 | Full suite, run 2 | same | PASS, identical |
| B-04 | Full suite, run 3 | same | PASS, identical — three consecutive, which is the flake evidence |
| B-05 | Lockfile singularity | `ls *lock*` | one `package-lock.json`; npm is the manager |
| C-01 | Dependency audit, before | `npm audit --json` | 2 HIGH: nodemailer credential disclosure + DoS, zod memory exhaustion |
| C-02 | Advisory ranges | `npm audit --json` detail | both fixes semver-major; nodemailer 9.1.1→10.2.1, zod 3.25.76→4.6.7 |
| C-03 | Upgrade surface review | `grep` nodemailer + zod call sites | nodemailer: createTransport+sendMail only, unchanged in v10. zod: already uses v4-style `.issues`; only break was 2× single-arg `z.record()` |
| C-04 | Upgrade applied | `npm i nodemailer@^10.2.1 zod@^4.6.7` | installed; 2 call sites patched with explicit key schema |
| C-05 | Dependency audit, after | `npm audit` | **zero vulnerabilities** |
| D-01 | Secret scan, working tree | `tests/t32-secrets.js` (in suite) | PASS |
| D-02 | Secret scan, FULL git history | `git log --all -S<pattern>` × 8 patterns | `sk-ant-api03`, `AKIA`-as-key, private keys, postgres URLs: none. `sk_live_`/`AKIA` hits are the scanner's own detection patterns plus random base64 inside glTF geometry |
| D-03 | The one real key in client code | `grep AIza frontend/assets/config.js` | Firebase **web** API key — public by design; t32 exempts that exact path and flags it anywhere else. Not a leak |
| D-04 | Historical credential | documented | Neon password in `d27bde2`, rotated 11 Sep. Dead, not absent — history is permanent |
| E-01 | Stub / fake-data sweep | `grep -riE "TODO\|FIXME\|HACK\|coming soon\|not implemented\|placeholder\|mock\|dummy\|lorem"` over `api/ shared/ frontend/` | PASS — every hit is a comment about the word, a CSS `::placeholder`, or a doc link. No stub in a production path |
| E-02 | Unwired control sweep | script over all `frontend/*.html` | 42 buttons with ids, 42 wired. The single flag was an artefact of the scan's own string construction |
| F-01 | Model library integrity | `tools/validate-models.mjs --write` | 2,601 of 2,601 load in real Chromium; 291 animated |
| F-02 | Reference games playable | `t26`, `t25`, `t28`, `t34` (Playwright) | Midnight Post played start to finish incl. 390px phone viewport; no JS errors |
| G-01 | Test flake root cause | read `tools/run-tests.mjs` | Prior diagnosis WRONG: runner is serial `spawnSync`, never parallel. Real cause was a 2000ms hang guard defeating the game-clock pacing beside it |
| G-02 | Flake fix verified | B-02/03/04 | guard 2s→10s; skill assertion narrowed to mechanism; 3/3 green |

## Untestable in this environment — never to be reported as PASS

| Area | Why | Unblocked by |
|---|---|---|
| Production data: tenancy, restore drill, ledger difference | no `DATABASE_URL`, no snapshot access | human-actions #4, #10 |
| ~~Database schema and migrations~~ | **CORRECTED 10 Nov — see H-01 below. This row was wrong: a real Postgres 16 is installed in this container, so DDL and migrations execute here. Only production DATA was ever out of reach.** | — |
| Payments, webhooks, refunds, entitlements, ledger difference | no Stripe key, no staging | #5, #10 |
| AI quality, hallucination, injection, cost per task | no provider key | #1 |
| Load, p95, throughput, breaking point, recovery | no deployment reachable | #10 |
| Monitoring, alerting, incident detection | does not exist | #3 |
| Deploy, rollback, DR drill | no CI/CD access | #10 |
| Real deletion request end to end | no DB, no email platform | #10 |
| Notification delivery | no SMTP credentials | #10 |

---

## Cycle 2 — 10 Nov 2026. The SQL was executed, not read.

`/usr/lib/postgresql/16/bin` holds a complete PostgreSQL 16.15 server. It was
never used, and the row above said schema and migrations were untestable — which
was an assumption that went unchecked for seven weeks while every SQL statement
in `api/_ledger.ts` was asserted by regular expression and run by nobody.

A temporary cluster (`initdb` as the `postgres` user, unix socket, port 5433,
discarded afterwards) executed the statements this change adds, verbatim. These
are results, not readings.

| ID | Check | Result |
|---|---|---|
| H-01 | Cluster starts | PostgreSQL 16.15 up on a private socket; `select version()` answered |
| H-02 | `growth_briefs` DDL + index | `CREATE TABLE`, `CREATE INDEX` both clean |
| H-03 | Frozen-version write | second `INSERT` of the same `(brief_id, brief_version)` with a DIFFERENT payload inserted 0 rows **and the stored payload was still the original** — so `saveGrowthBrief` returns `conflict` and nothing is overwritten |
| H-04 | Effective lookup | at a fixed clock, returned only the in-window approved rows for the asked market and locale, ordered `brief_version DESC` — correctly excluding an expired brief and another market's brief |
| H-05 | Withdrawal | first `UPDATE … status='approved'` returned 1 row, the second returned 0 — so `archiveGrowthBrief` is true then false, with no double-archive |
| H-06 | Archive listing | the `payload->>` / `::numeric` expressions parsed and returned 86.25 and 83.5; null-safe where the key is absent |
| H-07 | Index actually used | `EXPLAIN` shows `Index Scan using growth_briefs_lookup`, not `Seq Scan` |
| H-08 | `blog_posts` migration on a POPULATED table | built the table as production has it today, inserted a post, then ran both `ADD COLUMN IF NOT EXISTS` twice: pre-existing row intact with NULL brief columns, second run a NOTICE and a no-op, and `ON CONFLICT (slug) DO NOTHING` still refused to overwrite an existing post |

**Recorded, not acted on (CLAUDE.md rule 33).** This cycle proved the mechanism
on one table. The other ~20 tables in `api/_ledger.ts` — wallets, the double-entry
ledger, `acu_credits`, `forge_jobs`, payouts, commission — have still never had
their DDL executed, and `tests/` has no database harness. Standing one up needs a
Postgres client in `devDependencies` (the Neon driver speaks only to Neon's
proxy), a decision about what a skipped DB test must do on a machine with no
Postgres, and Postgres in `.github/workflows/gate.yml`. That is its own piece of
work with its own design questions, and it was not folded into this one.
