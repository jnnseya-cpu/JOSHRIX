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
| Database schema, migrations, tenancy, restore drill | no `DATABASE_URL` | human-actions #4, #10 |
| Payments, webhooks, refunds, entitlements, ledger difference | no Stripe key, no staging | #5, #10 |
| AI quality, hallucination, injection, cost per task | no provider key | #1 |
| Load, p95, throughput, breaking point, recovery | no deployment reachable | #10 |
| Monitoring, alerting, incident detection | does not exist | #3 |
| Deploy, rollback, DR drill | no CI/CD access | #10 |
| Real deletion request end to end | no DB, no email platform | #10 |
| Notification delivery | no SMTP credentials | #10 |
