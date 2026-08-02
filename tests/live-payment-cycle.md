# Live payment cycle — the one test that cannot be automated from here

**Run this before you announce. It takes about 10 minutes and it is the only
way to know that real money behaves correctly.** Everything else in `tests/`
runs against mocks; this runs against Stripe.

Use **Stripe test mode first** (test keys + test webhook secret), then repeat
step 1–3 once in live mode with a real card you can refund.

---

## Before you start

Open two tabs: your Stripe Dashboard (Developers → Events) and
`https://www.joshrix.com/api/health`. Note your ACU balance on `/wallet.html`.

---

## 1. Purchase — money in, ACUs credited exactly once

1. Go to `/wallet.html` → buy the **£5 / 500 ACU** package.
2. Pay with `4242 4242 4242 4242`, any future expiry, any CVC.
3. You land back on `/wallet.html?topup=success`.

**Verify:**
- Balance increased by **exactly 500** — not 0, not 1000.
- Stripe → Events shows `checkout.session.completed` with a **200** response.
- The amount charged is **£5.00**. Not a penny more.

**If the balance did not move:** the webhook is not reaching you. Check
Developers → Webhooks → your endpoint URL is
`https://www.joshrix.com/api/stripe-webhook` and that `STRIPE_WEBHOOK_SECRET`
in Vercel matches the signing secret shown there. This is the single most
common launch-day failure.

---

## 2. Duplicate webhook — the customer must not be credited twice

1. In Stripe → Events, open the `checkout.session.completed` from step 1.
2. Click **Resend**.

**Verify:**
- Response is 200 with `"persisted":"duplicate"`.
- **Balance did NOT change.** If it doubled, stop the launch — you are
  double-crediting every retried webhook, and Stripe retries often.

---

## 3. Refund — money out, credit reclaimed automatically

1. Stripe → Payments → find the £5 charge → **Refund** in full.

**Verify:**
- Balance dropped by **500** (or to 0 if you had already spent some).
- Stripe → Events shows `charge.refunded` with a 200 response.
- You receive the operator alert email stating how many ACUs were reclaimed
  and whether any shortfall was already spent.

**If the balance did not drop:** refunded customers are keeping free AI
credit. Every refund costs you real provider money. Do not launch paid
top-ups until this passes.

---

## 4. Failure paths — nobody is charged for nothing

| Test | Expected |
|---|---|
| Start a checkout, close the tab before paying | No ACUs, no charge, no ledger entry |
| Pay with `4000 0000 0000 0002` (declined) | Clear failure message, no ACUs, no charge |
| Pay with `4000 0025 0000 3155` (3-D Secure) | Completes after the challenge, credits once |

---

## 5. Forge economics — the customer is never overcharged

1. Note your balance. Forge one 2D game.
2. When it arrives, note the balance again.

**Verify:**
- The hold was 300 but the **settled charge is far smaller** (typically 30–60).
  The difference returns automatically — that is the metered model working.
- If the build failed to render, you were **refunded in full** and the note
  says so.

Then check `https://www.joshrix.com/api/forge-log` — the top entry names the
provider that built it and the reason any others failed.

---

## 6. Kill switch — rehearse it before you need it

1. Vercel → Settings → Environment Variables → add `FORGE_DISABLED` = `1`.
2. Redeploy (or wait for propagation), then try to forge.

**Verify:** you get "Game generation is paused for maintenance — your ACUs are
untouched." No AI spend occurs.

3. **Remove the variable again** and confirm forging works.

Know this path cold. If costs run away tomorrow, this is how you stop them in
under two minutes without a code change.

---

## What to do if any step fails

Do not "fix it live". Set `FORGE_DISABLED=1`, disable the top-up button, and
report the exact step number and what you saw. Every one of these failures is
recoverable in minutes if caught before customers hit it, and expensive
afterwards.
