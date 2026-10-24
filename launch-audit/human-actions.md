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

## 3. Set up error monitoring  — blocks gate 9

Nothing watches production. Sentry or equivalent, DSN in Vercel. Until then the
first production failure reaches you as a complaint from the person it happened
to. **What I do next:** wire the client and server handlers and verify an alert
actually fires by triggering a controlled failure.

## 4. Take and restore one Neon snapshot  — blocks gate 5

Snapshots have never been restored. An unrestored backup is not a backup. Take
one, restore it into an isolated branch, and record how long it took. **What I do
next:** write that into a runbook with the measured RTO.

## 5. Run one live payment cycle in Stripe test mode  — blocks gate 6

`tests/live-payment-cycle.md` has never been executed. **What I do next:** verify
the ledger difference is zero and produce the financial invariants report the
brief asks for.

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
