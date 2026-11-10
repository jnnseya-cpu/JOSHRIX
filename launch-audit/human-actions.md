# Human action list — commit e9c5487

Ordered by what unblocks the most. Each item says why it blocks, and what I will
do the moment it is done.

## 1. Run one 3D forge and send the build log  — blocks gate 2, gate 3, gate 13

**Why it blocks.** The forge is the product. It has never produced a build you
judged good, and that is now six weeks old. Every marketing claim, the whole
truth gate, and the AI quality gate rest on it. No amount of code work moves
this.

**What is needed.** A funded or tester wallet (`/admin` → "Make tester", refills
to 20,000 ACU), then one 3D forge. Send `/api/forge-log` — provider, bytes,
models — or the file from **View Build Source**.

**What I do next.** Diagnose the actual output rather than the mechanism, and fix
what the log shows. The library is no longer any part of the excuse: 2,601
models, 291 animated, all load-tested.

## 2. Revoke the legacy tester wallets  — live money leaving now

Every account created before 18 Aug is still `tester` and refills itself for
free. One pass through `/admin` → "Revoke tester". This is the only item on the
list that is costing you money today.

## 3. ~~Set up error monitoring~~ — DONE from this side, 10 Nov. Nothing left for you.

This asked for Sentry and a DSN, which is yours to buy. The half that needed no
vendor and no key should not have waited for one, and it has now been built.

Thirty-three handlers used to end in
`catch (err) { res.status(502).json({ error: "...", detail: String(err.message) }) }`
— the failure lived exactly as long as the request, nothing counted it, and the
error message went to the *caller*. All thirty-three now go through
`api/_observe.ts`: the failure is categorised, credentials are stripped from the
message, it is written to `error_events`, and the caller gets a sentence and an
8-character **reference**.

Three things that changed for you:

- `/admin` → **What Is Breaking** lists the last 24 hours grouped by operation.
- When a user quotes a reference, paste it into that panel and you get the exact
  operation, category and message. That is what the reference is for.
- `/api/security-agent` ran nightly, built findings, and on critical or high
  wrote a row to a table nobody reads. **It emails you now.** "Nothing watches
  production" was true even though that file existed.

**Still worth buying Sentry for:** client-side JavaScript errors, stack traces,
release tracking and a phone notification. This covers server failures, counts
them, keeps 30 days and puts them in the one mail that already goes out. Set the
DSN whenever you like and I will wire it alongside; nothing here has to be
removed first.

## 4. Take and restore one Neon snapshot  — blocks gate 5. NOW ONE COMMAND.

Snapshots have never been restored, and an unrestored backup is not a backup.
The part that was yours was never the hard part — it was that nobody had written
the procedure, so doing it meant inventing one on the night it mattered.

`tools/restore-drill.mjs` is that procedure. Create a Neon branch, then:

```
node tools/restore-drill.mjs --source "$DATABASE_URL" --into "<the branch's connection string>"
```

It dumps, restores, compares **every table's row count**, re-checks that every
`ledger_tx` still sums to zero on the restored copy, and prints the measured
RTO. Exit code 0 means the backup restores; 1 means it does not.

It refuses to run over the source, refuses a target that already has tables
unless you pass `--force-overwrite`, redacts connection strings in its output,
and never writes to the source. Verified against a real PostgreSQL 16 cluster
both ways — a clean restore passes, a broken one fails with the table named. See
`launch-audit/evidence-ledger.md` J-01 to J-06.

**Send me the output** and I will put the measured RTO in the runbook. That is
all that is left of this item.

## 5. Run one live payment cycle in Stripe test mode  — blocks gate 6. HALF DONE.

`tests/live-payment-cycle.md` still has to be run by you: only a real cycle
proves the dashboard is configured correctly and that settlement actually
credits a wallet in Postgres.

But the webhook door itself no longer needed your account to test. The Stripe
SDK can sign a payload locally, so `tests/t49-stripe-signature.js` now drives 40
assertions through the real handler: a genuine signature is accepted, a tampered
body is refused, a payload signed with another secret is refused, a replayed
timestamp is refused, a missing header is refused — and with no
`STRIPE_WEBHOOK_SECRET` configured it answers **503, not 200**. That last one is
the assertion that matters: an endpoint that returns 200 without verifying is
one where anyone who knows the URL can mint ACUs, and it would look perfectly
healthy in every log.

It also pins the renewal double-credit fix: both `invoice.paid` and
`invoice.payment_succeeded` carry the same invoice id, which is what the credit
is claimed against.

**What I do next, unchanged:** verify the ledger difference is zero from your
real cycle and produce the financial invariants report.

## 6. Add the three Stripe webhook events  — silent revenue leak

In Developers → Webhooks add `customer.subscription.updated` and
`invoice.payment_failed`, and confirm `charge.refunded` is on. Without the first,
a lapsed subscription keeps its commission rate no matter what the code says.

## 7. Confirm the Vercel Node major  — EOL runtime risk

`package.json` declares only `node >= 20`, and Node 20 is past security support.
Check the Vercel project setting; if it says 20, move it to 22 or 24. **What I do
next:** tighten the declared floor to match, in the same commit as a deployment
note. Doing it in the other order breaks the build.

## 8. Stripe Connect onboarding  — blocks gate 11

Until this exists, payouts leave by hand. Needs your Stripe account, not code.

## 9. Set `NEWSLETTER_SECRET`  — unsigned unsubscribe tokens

Any long random string. Without it anyone could unsubscribe another address.

## 10. Create a staging environment  — blocks safe destructive testing

There is nowhere to test payments, migrations or failure injection without
touching production. **What I do next:** everything in gates 5, 6, 7 and 8 that
currently reads UNTESTABLE.

## 11. Legal sign-off on the public copy  — not a code decision

Terms, privacy, refunds and the pricing wording are drafted and consistent with
the code. Whether they are sufficient for the UK and your target regions is a
lawyer's call, not mine.

## What I must never be given

`MODERATION_KEY` is the only admin credential and is never shared with an agent,
including me. Anything that needs it is yours to run. I will always hand you the
exact command instead.

---

## How to see what is still missing — added 24 Oct

`/admin` now has an **API Keys** panel, backed by `GET /api/admin-keys`. It
reports every one of the 31 variables the platform reads: whether it is set,
what it powers, what breaks while it is missing, and the exact command to set
it. Tick "only show what is missing" and the list is your to-do.

It never shows a key and cannot set one. Keys stay in the hosting platform's
secret store, which encrypts them at rest and never serves them to a browser;
the panel shows a one-way fingerprint so you can confirm a rotation took effect.
Storing them in the database behind an admin form would have meant the admin
password alone was enough to walk away with every credential the business owns.

Three things the panel will tell you that are easy to miss:

- **`STRIPE_WEBHOOK_SECRET` is the silent one.** Without it a customer pays
  successfully and receives nothing, because credit is applied only from a
  verified webhook.
- **The three AI providers are a chain, not three requirements.** One is enough
  to run; the panel marks the set satisfied rather than demanding all three.
- **Four keys buy you nothing.** `IMAGE_GEN_API_KEY`, `MESHY_API_KEY`,
  `TRIPO_API_KEY` and `ELEVENLABS_API_KEY` flip a boolean on `/api/health` and
  change no behaviour. They are marked cosmetic so you do not buy a
  subscription for a feature that does not exist.
