# INCIDENT — Stripe webhook returning 500 on every live event

> **RESOLVED 20 Nov 2026.** `/api/health` returns `ok: true`, `database.reachable: true`
> (399 ms), `build: adfc657`, `mode: live`. The cause was NOT the database — Neon was
> healthy throughout. Two faults stacked: `vercel.json` carried a `//forge-duration`
> pseudo-comment that failed schema validation, so **every deployment since 18
> September failed** and the site served 11 September code; and once that was fixed,
> Vercel emitted ESM `.js` against a CommonJS `package.json`, so **every function
> crashed at import**. The webhook was never reached. Remaining action: resend the 29
> failed events from the Stripe dashboard before **26 Nov 19:16 UTC**.

**Opened:** 20 Nov 2026, from Stripe's own failure notice.
**Started:** 17 Nov 2026, 19:16:17 UTC (first failure, per Stripe).
**Scope:** 29 live events, all HTTP 500. Stripe stops retrying **26 Nov 2026, 19:16 UTC**.
**Endpoint:** `https://www.joshrix.com/v1/payments/stripe-webhook` → `api/stripe-webhook.ts`.
**Stripe account:** JNN Global Ltd (`acct_1OqYHECI7tOS13Se`).

---

## What the 500 actually means

The webhook is **not** broken in the way the notice implies. The signature
verified, the event routed, and then the **ledger write failed**. The handler
returns 500 deliberately at that point, so that Stripe retries rather than
treating a payment as settled when it was not. That part worked as designed.

What did not work was everything around it:

1. **The body said nothing.** Twenty-nine attempts returned
   `"settlement failed — will retry"`. Stripe's dashboard shows a webhook's
   response body against every attempt, which makes it the one place an operator
   can read a cause without access to the platform's logs. It carried no cause.

2. **`/api/health` reported `ledger: true` throughout.** It tested whether the
   `DATABASE_URL` *environment variable was set*, never whether the database
   answered. The one endpoint whose job is "is this deployment well" could not
   see the thing that was wrong.

3. **A retry could have credited twice.** The catch released the idempotency
   claim on *every* failure. That is correct only while nothing has been
   written. `creditAcu` is idempotent on the Stripe session, but `creditWallet`
   is a bare balance increment with no key — so a failure after the wallet was
   credited would release the claim and the retry would add the ACUs again,
   while the credit row silently no-opped and `postTx` booked a second set of
   postings for one payment.

The cause of the ledger failure itself **has not been identified**. This
environment cannot reach `www.joshrix.com` (the egress proxy refuses it) or
Neon, so there is no way to read the live error from here. Everything below is
about making the next five minutes of diagnosis trivial, not a claim to have
found it.

---

## Fixed in this commit

- **The 500 body is now the diagnostic.** It carries `reference`, `category`
  (database / provider / payment / timeout / validation), a redacted `detail`,
  and `mutated` — whether anything had been written before the failure. Visible
  on every failed attempt in the Stripe dashboard. Redacted first, because a
  Postgres driver puts the connection string, password included, in the message
  when it cannot connect, and this body leaves the building.
- **`/api/health` connects.** One bounded `SELECT 1`, and on failure the reason
  and its category. `ok` is no longer true while the database is refusing.
- **A retry can no longer double-credit.** The claim is released only when
  nothing was written. Every settlement path flags its first write, including
  the renewal path's per-invoice claim — releasing the event claim while that
  claim survived would make the retry *skip* a credit the customer paid for,
  which is the same bug facing the other way.
- **A partial settlement alerts a human** rather than being quietly retried.
- Non-database settlement failures are recorded to `error_events`, so they show
  up in `/admin` → **What Is Breaking**. Database failures deliberately are not:
  writing to Postgres to record that Postgres is refusing adds two doomed
  queries to every retry and records nothing.

---

## What Justin does next, in order

1. **Wait for this deploy, then open** `https://www.joshrix.com/api/health`.
   The `database` block answers it: `reachable: true` with a time, or
   `reachable: false` with the reason and category. That is the diagnosis.
2. **Or open any failed event** in Stripe → Developers → Webhooks → the
   endpoint → a failed attempt. The response body now names the category and
   the detail.
3. **Fix what it names.** The likely candidates, in order: the Neon connection
   string is stale or the password was rotated without updating
   `DATABASE_URL`; the Neon compute is suspended or over quota; a schema
   change. All three look identical from outside and different in that body.
4. **Then resend the failed events** from the Stripe dashboard. This is safe:
   `claimEvent` dedupes on the Stripe event id, so an event that did settle is
   rejected as a duplicate rather than settled twice.
5. **Check for customers who paid and were not credited.** Every one of the 29
   events is a real payment that produced no ACUs. Resending covers them; any
   that still look wrong afterwards need a manual grant from `/admin`.

**The deadline is real.** After 26 Nov 19:16 UTC Stripe stops retrying and the
failed events can only be replayed by hand from the dashboard.

---

## Not done, and deliberately

`creditWallet` is still a bare increment with no idempotency key. The claim flag
makes the retry path safe, but the underlying call would still double-credit if
any other caller invoked it twice for one payment. Giving wallet credits a
settlement key is the real fix and it is a schema change to a money table — not
something to fold into an incident patch at speed. Recorded here so it is not
lost.

`t4-crawl`'s other findings (12 pages logging a JS error) remain report-only,
unchanged by this incident.
