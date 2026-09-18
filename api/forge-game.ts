/**
 * POST /api/forge-game — START a forge. Returns a ticket, not a game.
 * Body: { prompt, title?, summary?, language?, walletId?, blueprint?, mode?, ticket? }
 * Returns: 202 { ticket, status: "queued", poll, worker }
 *
 * WHY THIS NO LONGER RETURNS THE GAME. It used to generate inside the request,
 * which put an absolute ceiling on a forge equal to the platform's `maxDuration`
 * — and past that ceiling the socket dies with the model still writing, so the
 * creator gets nothing at all. Justin's requirement is that AI work runs until it
 * produces the expected result, however long that takes, and no value of any
 * timeout delivers that. The run has to outlive the request.
 *
 * So this endpoint now does everything that must happen BEFORE any provider is
 * called — validate the concept, scan it, rate-limit, prove the wallet can fund
 * work — and then writes a durable job. api/forge-worker.ts advances it one slice
 * at a time until it succeeds; api/forge-result.ts reports progress and delivers
 * the finished build. The retry loop and the money live in api/_forgejobs.ts.
 *
 * NOTHING WAS RELAXED TO GET HERE. The concept is still sanitised and shape
 * scanned before anything is stored, the per-IP and per-wallet limits still
 * apply, an empty wallet is still refused, and a blocked concept still costs
 * nothing. What changed is that the answer arrives through a ticket.
 *
 * COMPATIBILITY. The Studio already mints a ticket and already polls
 * /api/forge-result for the finished build — that pair existed so a dropped
 * connection could not lose a completed forge. This makes the poll the primary
 * channel instead of the backup, which is why no second response shape was
 * invented for it.
 */
import { randomUUID } from "crypto";
import { FORGE_MIN_CHARGE } from "./_gateway";
import { getDb, ensureGameSchema, getWallet, releaseExpiredForgeHolds } from "./_ledger";
import { ensureForgeJobSchema, createForgeJob, getForgeJob } from "./_forgejobs";
import { recordSecurityEvent } from "./_guard";
import { scanConcept, sanitiseConcept } from "./_security";
import { clientIp, rateLimit, tooMany, forgeDisabled, ledgerRequired } from "./_guard";

/**
 * The most a creator may paste. The BUILD prompt is capped separately and much
 * lower (MAX_CONCEPT_CHARS), because a design document pasted verbatim next to
 * "write one HTML file" is what produced a file with no canvas — but the
 * blueprint stage benefits from the whole brief, so the request may carry far
 * more than the build will use. Bounded all the same: this string is stored,
 * logged and re-read on every attempt of the run.
 */
const MAX_PROMPT_CHARS = 120_000;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { prompt, title, summary, language, walletId, blueprint, mode, ticket } = (req.body ?? {}) as Record<string, any>;
  if (!prompt || typeof prompt !== "string" || prompt.length < 4) {
    return res.status(400).json({ error: "Body must include the game concept in `prompt`." });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_CHARS.toLocaleString("en-GB")} chars).` });
  }
  const sql = getDb();
  const _noLedger = ledgerRequired(sql);
  if (_noLedger) return res.status(503).json({ error: _noLedger, mode: "no_ledger" });
  const paused = forgeDisabled();
  if (paused) return res.status(503).json({ error: paused });

  /* The concept is arbitrary public text. Strip the characters that hide it
     from a human reviewer, then judge its SHAPE — never its subject. A horror
     game about hackers is a game; text addressed to the model is not. */
  const concept = sanitiseConcept(prompt);
  const verdict = scanConcept(concept);
  if (verdict.action !== "allow") {
    await recordSecurityEvent(sql!, "concept_flagged", verdict.action === "block" ? "block" : "warn", {
      ip: clientIp(req), risk: verdict.risk, reasons: verdict.reasons,
      excerpt: concept.slice(0, 400), walletId: walletId ?? null,
    }).catch(() => { /* the refusal below matters more than its log line */ });
    if (verdict.action === "block") {
      // Nothing was generated and no job was written, so nothing is owed.
      return res.status(400).json({
        error: "That description reads as instructions aimed at the AI rather than a game concept, so it was not run.",
        reasons: verdict.reasons,
        help: "Describe the game you want — the world, the player, what they do, how they win. Your ACUs are untouched.",
      });
    }
  }

  const is3d = mode === "3d";

  // DENIAL-OF-WALLET GUARD. Every forge spends real provider money, so the
  // rate limit is per IP *and* per wallet — a stolen wallet id cannot be
  // driven from many machines, and one machine cannot cycle many wallets.
  const ipRl = await rateLimit(sql!, "forge:ip:" + clientIp(req), 30, 3600);
  if (!ipRl.ok) return tooMany(res, ipRl.retryAfter, "game builds");
  if (walletId) {
    const wRl = await rateLimit(sql!, "forge:w:" + String(walletId).slice(0, 80), 20, 3600);
    if (!wRl.ok) return tooMany(res, wRl.retryAfter, "game builds on this account");
  }
  if (!walletId) return res.status(402).json({ error: "No wallet — open the Studio to initialise your ACU wallet, or top up at /wallet.html." });

  /* THE ONLY SPENDING CHECK LEFT, and it is the honest one.
   *
   * There used to be a fixed hold here — 500 ACUs for 2D, 750 for 3D — debited
   * before generating. That hold WAS the ACU limit: a run could not cost more
   * than it, so a game needing a fourth attempt was refused a fourth attempt no
   * matter how close the third came. Now each attempt debits what it actually
   * cost and the run continues while the wallet can fund another, so the only
   * question to answer here is whether it can fund the FIRST one. */
  let balance = 0;
  try {
    await ensureGameSchema(sql!);
    await ensureForgeJobSchema(sql!);
    // Hand back any hold the creator left undecided, so an abandoned forge can
    // never make the next one unaffordable.
    await releaseExpiredForgeHolds(sql!, walletId).catch(() => { /* best-effort */ });
    const w = await getWallet(sql!, walletId);
    balance = w ? Number((w as any).balance ?? 0) : 0;
  } catch (err: any) {
    return res.status(502).json({ error: "Wallet check failed", detail: String(err?.message ?? err) });
  }
  if (balance < FORGE_MIN_CHARGE) {
    return res.status(402).json({
      error: `Not enough ACUs to start a forge (at least ${FORGE_MIN_CHARGE} needed). Top up at /wallet.html.`,
      acuCharge: FORGE_MIN_CHARGE,
      balance,
    });
  }

  /* The ticket is the job's identity and the client mints it, so it has to be
     treated as untrusted input: validated in shape, and never allowed to attach
     this request to a job belonging to someone else. */
  const jobTicket = typeof ticket === "string" && /^[a-z0-9-]{8,64}$/i.test(ticket)
    ? ticket
    : randomUUID();

  try {
    const created = await createForgeJob(sql!, {
      ticket: jobTicket, walletId, mode: is3d ? "3d" : "2d", concept,
      title: typeof title === "string" ? title.slice(0, 200) : undefined,
      summary: typeof summary === "string" ? summary.slice(0, 600) : undefined,
      language: typeof language === "string" ? language.slice(0, 16) : undefined,
      blueprint,
    });
    if (!created) {
      /* The ticket already exists. A retried POST of the same forge is fine and
         must be idempotent — but a ticket belonging to another wallet is either
         a collision or an attempt to hijack a run, and both are refused. */
      const existing = await getForgeJob(sql!, jobTicket);
      if (!existing) return res.status(502).json({ error: "could not queue the forge" });
      if (existing.wallet_id && existing.wallet_id !== walletId) {
        return res.status(409).json({ error: "that ticket is already in use — retry with a new one" });
      }
    }
  } catch (err: any) {
    return res.status(502).json({ error: "could not queue the forge", detail: String(err?.message ?? err) });
  }

  /* 202, not 200: the work is accepted and has not happened yet. The two URLs
     are returned rather than hard-coded in the client so there is one place that
     decides how a forge is driven. */
  return res.status(202).json({
    ticket: jobTicket,
    status: "queued",
    queued: true,
    mode: is3d ? "3d" : "2d",
    worker: "/api/forge-worker",
    poll: "/api/forge-result",
    note: "The forge runs until it produces a build that clears every quality gate. "
        + "Call the worker URL to advance it and poll the result URL for progress; "
        + "it also finishes on its own if you close the page.",
  });
}
