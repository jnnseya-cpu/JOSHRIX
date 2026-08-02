# JOSHRIX Studio — Go-Live Runbook

**Build `2026-08-02.66`.** Read this before you announce, and keep it open on
launch day.

---

## 1. Thirty minutes before you announce

Run these in order. Each takes seconds and each has caught a real defect.

| # | Check | Pass looks like |
|---|---|---|
| 1 | `https://www.joshrix.com/api/health` | `build: 2026-08-02.66`, `mode: live`, ledger `true` |
| 2 | `https://www.joshrix.com/api/forge-selftest` | at least one provider `ok: true` (currently OpenAI) |
| 3 | `tests/live-payment-cycle.md` steps 1–3 | 500 ACUs in, no double-credit, refund reclaims them |
| 4 | Sign out, open `/studio.html` | Redirects to login — the gate holds |
| 5 | Sign in, forge one 2D game | Bespoke build arrives, plays, charge far below the hold |
| 6 | `https://www.joshrix.com/api/forge-log` | Your forge is the top entry, with the provider named |

**If check 3 fails, do not announce.** Everything else has a workaround;
mishandled money does not.

---

## 2. The two dials you control

**Stop all AI spend instantly** — Vercel → Settings → Environment Variables →
`FORGE_DISABLED` = `1`. Customers see "Game generation is paused for
maintenance — your ACUs are untouched." No deploy needed. Rehearse this once
tonight (see `tests/live-payment-cycle.md` §6).

**Roll back a bad deploy** — Vercel → Deployments → the previous build →
"Promote to Production". Under a minute.

---

## 3. What protects you automatically

- **Nobody pays for a broken game.** A build that fails to render is swapped
  for a working one and the charge is refunded, single-use, server-verified.
- **Nobody is overcharged.** Holds settle to metered actual cost; the unused
  part returns immediately. Typical 2D forge: 300 held, ~35 charged.
- **Nobody sees a blank screen.** If all three AI providers fail, a
  deterministic engine game ships instead, labelled honestly as not their
  concept.
- **Nobody drains your budget.** 30 forges/hour per IP, 20 per wallet, 2,000
  free ACUs per verified mailbox — `+tags`, gmail dots and googlemail aliases
  all collapse to one identity.
- **No double-charging.** Stripe webhooks are signature-verified and
  idempotent; a replayed event credits nothing.
- **Nothing fails silently.** Every forge is recorded in `/api/forge-log`
  with per-provider failure reasons.

---

## 4. What is NOT covered — know these before customers find them

| Gap | Consequence tomorrow | Mitigation |
|---|---|---|
| **Game quality is unproven** | A customer pays for a "premium 3D game" and gets something mediocre. **This is your largest reputation risk.** | Set expectations in your announcement: "early access", show a real example, offer refunds freely |
| **Payouts cannot execute** | Creators can request withdrawals but money cannot leave until Stripe Connect is onboarded | Say so on the earnings page before anyone earns |
| **Gemini is 403'd** | You are single-provider on OpenAI. If OpenAI has an incident, forging stops | The engine fallback keeps the site usable; fix the Google account when you can |
| **No load testing** | Behaviour under a traffic spike is unknown | Watch Vercel's function metrics for the first hours |
| **Backups never restored** | An unrecoverable database incident is possible | Take a manual Neon snapshot before you announce |
| **No alerting** | You find out about failures from customers | Keep `/api/forge-log` and `/api/health` open on launch day |

---

## 5. Launch-day watch list

**First hour, every 15 minutes:** `/api/forge-log` (are builds succeeding and
which provider?), Stripe → Payments (are charges landing?), Vercel → Functions
(any 5xx?), your OpenAI usage dashboard (spend rate).

**Pull the kill switch if:** AI spend exceeds your comfort threshold, the
forge log fills with failures, or any payment behaves unexpectedly. Pausing
for an hour costs you far less than a public money bug.

---

## 6. Honest verdict

**Technically: ready.** 111 automated assertions pass. 490 hostile probes
produced zero crashes, zero 5xx, zero information leaks. Money is
mathematically balanced, idempotent, and refundable. Abuse is capped. Failure
is instrumented and reversible.

**Commercially: unproven.** The platform has never yet produced a game its own
owner judged sellable. That is not a bug to fix overnight — it is a quality
question only real customer reaction can answer.

**So launch it as what it is.** Announce early access, not a finished studio.
Price honestly, refund generously, and let the forge log tell you what to fix
first. The engineering will hold. Manage the promise, not the platform.
