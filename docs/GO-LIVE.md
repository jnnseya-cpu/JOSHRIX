# JOSHRIX Studio — Go-Live Runbook

Read this before you announce, and keep it open on launch day.

**Last checked against the code: 19 Aug 2026.** `BUILD_ID` is the deployed commit
SHA now, so `/api/health` tells you exactly which commit is serving — if it does
not match your latest push, nothing else on this page is meaningful yet.

---

## 1. Thirty minutes before you announce

Run these in order. Each takes seconds and each has caught a real defect.

| # | Check | Pass looks like |
|---|---|---|
| 1 | `https://www.joshrix.com/api/health` | `build` = your latest commit SHA, `mode: live`, ledger `true` |
| 2 | `https://www.joshrix.com/api/forge-selftest` | **gemini** `ok: true` and over ~10,000 bytes. A pass under that is a stub, not a game |
| 3 | `tests/live-payment-cycle.md` steps 1–3 | 500 ACUs in, no double-credit, refund reclaims them |
| 4 | Sign out, open `/studio.html` | Redirects to login — the gate holds |
| 5 | Sign in, forge one 2D game | Bespoke build arrives and plays. Nothing is charged until you publish it |
| 6 | `https://www.joshrix.com/api/forge-log` | Your forge is the top entry, naming the provider and the byte size |
| 7 | Publish it, then price it on `/dashboard` | The split is quoted before you save; the listing appears on `/marketplace` |

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

- **Nobody pays for a build they do not keep.** A forge takes a HOLD (250 for 3D,
  150 for 2D) and collects nothing. Publishing the game, or spending an Enhance
  pass on it, settles it to what the run actually cost (~40–95) and refunds the
  rest. Refine, discard or walk away and the whole hold returns; an undecided
  hold is swept back after 24 hours. This is the answer to "I paid and got
  something worthless" — that case is now free.
- **Nobody is overcharged.** The charge is clamped to the hold, so a bad settle
  estimate can never overdraw a creator.
- **Nobody sees a blank screen.** If all three AI providers fail, a
  deterministic engine game ships instead, labelled honestly as not their
  concept. A 3D build under 9,500 bytes is treated as a stub and demoted.
- **Nobody drains your budget.** 30 forges/hour per IP, 20 per wallet, and
  **no free AI**: a public signup starts at zero ACUs and tops up. Free credit
  exists only for wallets you designate as testers in `/admin`. One address is
  one wallet — `+tags`, gmail dots and googlemail aliases all collapse.
- **Nobody sets their own price or commission.** A sale price comes from the
  listing and the commission from the seller's plan, both read server-side.
- **No double-charging.** Stripe webhooks are signature-verified and
  idempotent; a replayed event credits nothing.
- **Nothing fails silently.** Every forge is recorded in `/api/forge-log`
  with per-provider failure reasons.

---

## 4. What is NOT covered — know these before customers find them

| Gap | Consequence tomorrow | Mitigation |
|---|---|---|
| **Game quality is unproven** | A customer pays for a "premium 3D game" and gets something mediocre. **This is your largest reputation risk.** | Set expectations in your announcement: "early access", show a real example, offer refunds freely |
| **Payouts still execute by hand** | `/admin` → Payout Desk now approves, rejects and marks paid, and a rejection returns the reservation. But nothing moves money automatically: Stripe Connect is not onboarded, so you pay the rail yourself and then mark it paid | Say so on the earnings page before anyone earns |
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

**Technically: ready.** `npm test` — 578 assertions across 27 files, including
two that drive a real browser. Money is mathematically balanced, idempotent, and
refundable; nothing is collected for a build the creator does not keep. Abuse is
capped. Failure is instrumented and reversible.

**Commercially: unproven.** The platform has never yet produced a game its own
owner judged sellable. That is not a bug to fix overnight — it is a quality
question only real customer reaction can answer.

**So launch it as what it is.** Announce early access, not a finished studio.
Price honestly, refund generously, and let the forge log tell you what to fix
first. The engineering will hold. Manage the promise, not the platform.
