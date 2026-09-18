/**
 * A FORGE IS A JOB, NOT A REQUEST.
 *
 * Justin, 18 Sep 2026: "every AI powered work must have no time limit and ACU
 * limit, regardless how long it can take and how much it will cost — the AI
 * powered functions must work until they produce the highly expected results."
 *
 * WHY A KNOB COULD NOT DELIVER THAT. On 11 Sep every forge timeout was collapsed
 * into one `FORGE_MAX_SECONDS`, which removed three chances to forget one — but
 * it did not remove the ceiling, because the ceiling is not ours. A Vercel
 * function is killed at its `maxDuration`, and past that the socket dies with
 * the model still writing: the creator sees "Code Agent unreachable" and gets
 * NOTHING, which is strictly worse than a short game. No value of any
 * environment variable changes that. The only way a run can take as long as it
 * needs is for the run to OUTLIVE the request.
 *
 * So a forge is now a durable job. `forge-game` validates, takes nothing on
 * trust, and returns a ticket immediately. `forge-worker` claims the job and
 * does as much as fits in one safe slice, writing its state back to Postgres
 * before it returns. The next invocation continues from there. Ten slices or
 * one, the creator's browser sees a single job that keeps making progress, and a
 * closed laptop stops nothing: the work is in the database, not in a socket.
 *
 * WHAT "UNTIL IT PRODUCES THE EXPECTED RESULT" MEANS IN CODE. Every attempt is
 * judged by `judgeBuild` — one judge, shared with the provider chain, never a
 * second copy of the quality bar. A failing attempt hands its exact reasons to
 * the next one as instructions, because a retry that sends the identical prompt
 * is the same dice roll at the same price. The loop ends on success, or when the
 * wallet can no longer fund an attempt, or when attempts stop getting closer.
 *
 * THAT LAST CONDITION IS NOT A DISGUISED LIMIT, and the distinction matters. A
 * run that is improving is never stopped, however long it takes and however much
 * it costs. A run that has produced three consecutive attempts no better than
 * its best is not "still working" — it is buying the same failure repeatedly,
 * which is rule 7 of the engineering directive applied to the model instead of
 * to me. Stopping there is also what keeps the published refund promise
 * affordable: /refunds says "you never pay for a failed forge", so every ACU a
 * doomed run spends is the platform's own money, not the creator's.
 *
 * MONEY. There is no new money path here and there must never be one. Each
 * attempt debits its own metered cost as it happens, so the wallet always
 * reflects real spend; the accumulated total becomes the hold in the EXISTING
 * charge-on-accept row (`recordForgeHold`), so publishing collects the true cost
 * of the whole run and discarding hands it all back exactly as before. What was
 * removed is the fixed 500/750 guess, which was the actual ACU ceiling: a run
 * could not cost more than its hold, so a build needing four attempts was
 * refused a fourth. Now the only bound is the wallet balance.
 */
import { randomUUID } from "crypto";
import {
  generateGameHtml, judgeBuild, looksPlayable, countLibraryModels, acuChargeForUsage,
  FORGE_MIN_CHARGE, ENGINE_BUILD_CHARGE, FORGE_MAX_SECONDS, worstAttemptAcu,
  type BuildVerdict, type TokenUsage,
} from "./_gateway";
import { buildPlayableGame } from "./_engine";
import { buildPlayable3dGame } from "./_engine3d";
import {
  type Sql, debitWallet, creditWallet, getWallet, recordForgeHold, recordForgeLog, saveForgeResult,
} from "./_ledger";
import type { GameBlueprint } from "../shared/contracts";

/**
 * How many consecutive attempts may fail to improve on the best score before the
 * run is called doomed. Three, because two is inside the noise of one model on
 * one prompt and four buys a third identical failure. Settable, because the right
 * number is an empirical question this platform has not yet been able to measure
 * — no forge has ever run here against real provider keys.
 */
export const MAX_STALE_ATTEMPTS = Math.max(1, Number(process.env.FORGE_MAX_STALE_ATTEMPTS) || 3);

/**
 * A job left running with no worker touching it for this long is dead, not slow:
 * every slice renews its lease before it starts work, so a lease this old means
 * the process holding it died. Reclaimed rather than abandoned, so a crashed
 * slice costs one attempt instead of the whole run.
 */
const LEASE_SECONDS = Math.max(60, FORGE_MAX_SECONDS + 30);

/** A job nobody has advanced for this long is given up on and refunded in full.
 *  Hygiene, not a limit: it only fires when no worker has run at all, which
 *  means the crons are down or the creator closed the tab and never returned. */
const ABANDON_HOURS = 24;

/** The least time in which a full-size generation has ever actually completed
 *  here, rounded up. Below this a slice stops rather than starting an attempt it
 *  will have to abort. */
const MIN_ATTEMPT_MS = 45_000;

export type ForgeJob = {
  ticket: string;
  wallet_id: string | null;
  mode: string;
  concept: string;
  title: string | null;
  summary: string | null;
  language: string | null;
  blueprint: string | null;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  stale: number;
  acu_held: number;
  best_html: string | null;
  best_provider: string | null;
  best_score: number | null;
  notes: string | null;
  error: string | null;
  payload: string | null;
  created_at?: string;
};

export async function ensureForgeJobSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS forge_jobs (
    ticket text PRIMARY KEY,
    wallet_id text,
    mode text NOT NULL DEFAULT '2d',
    concept text NOT NULL,
    title text,
    summary text,
    language text,
    blueprint text,
    status text NOT NULL DEFAULT 'queued',
    attempts integer NOT NULL DEFAULT 0,
    stale integer NOT NULL DEFAULT 0,
    acu_held bigint NOT NULL DEFAULT 0,
    best_html text,
    best_provider text,
    best_score double precision,
    notes text,
    error text,
    payload text,
    lease_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`;
  /* The worker claims by "oldest unleased job that is not finished". Without
     this index that is a sequential scan of every forge ever run. */
  await sql`CREATE INDEX IF NOT EXISTS forge_jobs_claimable
    ON forge_jobs (status, lease_until) WHERE status IN ('queued', 'running')`;
}

/** Queue a job. Idempotent on the ticket: a retried POST must not start a second
 *  run for the same forge, because two runs would both spend the wallet. */
export async function createForgeJob(sql: Sql, j: {
  ticket: string; walletId: string | null; mode: string; concept: string;
  title?: string; summary?: string; language?: string; blueprint?: unknown;
}): Promise<boolean> {
  const rows = (await sql`
    INSERT INTO forge_jobs (ticket, wallet_id, mode, concept, title, summary, language, blueprint)
    VALUES (${j.ticket}, ${j.walletId}, ${j.mode}, ${j.concept}, ${j.title ?? null},
            ${j.summary ?? null}, ${j.language ?? null},
            ${j.blueprint ? JSON.stringify(j.blueprint).slice(0, 200_000) : null})
    ON CONFLICT (ticket) DO NOTHING
    RETURNING ticket`) as Array<{ ticket: string }>;
  return rows.length > 0;
}

export async function getForgeJob(sql: Sql, ticket: string): Promise<ForgeJob | null> {
  const rows = (await sql`SELECT ticket, wallet_id, mode, concept, title, summary, language,
      blueprint, status, attempts, stale, acu_held, best_provider, best_score, notes, error, payload, created_at
    FROM forge_jobs WHERE ticket = ${ticket}`) as any[];
  return rows.length ? (rows[0] as ForgeJob) : null;
}

/**
 * Take exclusive ownership of one job for one slice.
 *
 * A single conditional UPDATE, which is how this stays correct without a
 * transaction: Postgres serialises the row, so if two workers fire at the same
 * instant — the cron and the creator's own browser, which is the normal case —
 * exactly one of them gets the row and the other gets nothing. Both then behave
 * correctly, because "no job to do" is a valid outcome for a worker.
 *
 * Pass a ticket to advance one specific job (the browser driving its own forge);
 * pass none to take the oldest waiting one (the cron sweeping).
 */
export async function claimForgeJob(sql: Sql, ticket?: string): Promise<ForgeJob | null> {
  const rows = (ticket
    ? await sql`UPDATE forge_jobs SET lease_until = now() + make_interval(secs => ${LEASE_SECONDS}),
          status = 'running', updated_at = now()
        WHERE ticket = ${ticket} AND status IN ('queued', 'running')
          AND (lease_until IS NULL OR lease_until < now())
        RETURNING *`
    : await sql`UPDATE forge_jobs SET lease_until = now() + make_interval(secs => ${LEASE_SECONDS}),
          status = 'running', updated_at = now()
        WHERE ticket = (
          SELECT ticket FROM forge_jobs
          WHERE status IN ('queued', 'running') AND (lease_until IS NULL OR lease_until < now())
          ORDER BY created_at LIMIT 1
        )
        RETURNING *`) as any[];
  return rows.length ? (rows[0] as ForgeJob) : null;
}

/** Best-so-far is kept in the database, not in memory: the slice that produces
 *  it is usually not the slice that finishes the run. */
async function saveProgress(sql: Sql, ticket: string, p: {
  attempts: number; stale: number; acuHeld: number; notes: string[];
  bestHtml?: string | null; bestProvider?: string | null; bestScore?: number | null;
}) {
  if (p.bestHtml != null) {
    await sql`UPDATE forge_jobs SET attempts = ${p.attempts}, stale = ${p.stale}, acu_held = ${p.acuHeld},
        notes = ${JSON.stringify(p.notes).slice(0, 8000)}, best_html = ${p.bestHtml},
        best_provider = ${p.bestProvider ?? null}, best_score = ${p.bestScore ?? null}, updated_at = now()
      WHERE ticket = ${ticket}`;
  } else {
    await sql`UPDATE forge_jobs SET attempts = ${p.attempts}, stale = ${p.stale}, acu_held = ${p.acuHeld},
        notes = ${JSON.stringify(p.notes).slice(0, 8000)}, updated_at = now()
      WHERE ticket = ${ticket}`;
  }
}

/** Hand the lease back without finishing, so the next slice continues promptly
 *  instead of waiting out a lease held by a process that has already returned. */
async function releaseLease(sql: Sql, ticket: string) {
  await sql`UPDATE forge_jobs SET lease_until = NULL, updated_at = now()
    WHERE ticket = ${ticket} AND status = 'running'`;
}

async function finishJob(sql: Sql, ticket: string, status: "succeeded" | "failed", payload: string, error?: string) {
  await sql`UPDATE forge_jobs SET status = ${status}, payload = ${payload}, error = ${error ?? null},
      lease_until = NULL, finished_at = now(), updated_at = now()
    WHERE ticket = ${ticket}`;
}

/** Coerce whatever was stored as a blueprint into the shape the engine needs.
 *  Same job as the copy in forge-game.ts did; this is now the only one. */
export function coerceBlueprint(bp: any, prompt: string, title?: string, summary?: string, language?: string): GameBlueprint {
  const b = bp && typeof bp === "object" ? bp : {};
  return {
    language: b.language || language || "en",
    title: String(b.title || title || prompt.slice(0, 48) || "Your Game"),
    summary: String(b.summary || summary || prompt.slice(0, 160)),
    genre: Array.isArray(b.genre) && b.genre.length ? b.genre.map(String) : ["Arcade"],
    coreLoop: Array.isArray(b.coreLoop) ? b.coreLoop.map(String) : ["Play"],
    targetAudience: String(b.targetAudience || "Everyone"),
    mechanics: Array.isArray(b.mechanics) ? b.mechanics.map(String) : [],
    characters: Array.isArray(b.characters) ? b.characters.map((c: any) => ({ name: String(c?.name || "Foe"), role: String(c?.role || "") })) : [],
    levels: Array.isArray(b.levels) && b.levels.length ? b.levels.map((l: any) => ({ name: String(l?.name || "Level"), objective: String(l?.objective || "") })) : [{ name: "Level 1", objective: "Score points" }],
    monetisationModel: String(b.monetisationModel || "Freemium"),
    assetList: Array.isArray(b.assetList) ? b.assetList.map(String) : [],
    technicalComplexity: (b.technicalComplexity === "low" || b.technicalComplexity === "high") ? b.technicalComplexity : "medium",
    estimatedCredits: Number.isFinite(b.estimatedCredits) ? b.estimatedCredits : 1200,
    suggestedPriceGBP: Number.isFinite(b.suggestedPriceGBP) ? b.suggestedPriceGBP : 4.99,
    commercialScore: Number.isFinite(b.commercialScore) ? b.commercialScore : 80,
    riskScore: Number.isFinite(b.riskScore) ? b.riskScore : 15,
    marketplaceCategory: String(b.marketplaceCategory || "Arcade"),
  } as GameBlueprint;
}

/** What the metered cost of one attempt is, in the same terms as everywhere
 *  else: 4x the provider's own cost for the tokens that attempt really used. */
function meteredCost(provider: string, usage?: TokenUsage): number {
  if (!usage) return FORGE_MIN_CHARGE;
  const key = provider === "claude" ? "claude-sonnet-5" : provider;
  return Math.max(FORGE_MIN_CHARGE, acuChargeForUsage(key, usage));
}

export type SliceOutcome = {
  status: "running" | "succeeded" | "failed";
  attempts: number;
  acuHeld: number;
  /** Set when the run ended in this slice. */
  provider?: string;
  reason?: string;
};

/**
 * Advance one job as far as one safe slice allows.
 *
 * The slice deadline is deliberately the same shape as the old whole-forge
 * deadline: stop STARTING work in time to write state and reply. The difference
 * is what happens when it expires — the job stays `running` and the next
 * invocation carries on, where before the creator's forge simply died.
 */
export async function runForgeJobSlice(sql: Sql, job: ForgeJob, sliceDeadline: number): Promise<SliceOutcome> {
  const is3d = job.mode === "3d";
  const bp = coerceBlueprint(job.blueprint ? safeJson(job.blueprint) : null, job.concept,
    job.title ?? undefined, job.summary ?? undefined, job.language ?? undefined);
  const engineHtml = is3d ? buildPlayable3dGame(bp) : buildPlayableGame(bp);

  let attempts = Number(job.attempts) || 0;
  let stale = Number(job.stale) || 0;
  let acuHeld = Number(job.acu_held) || 0;
  let bestScore = job.best_score == null ? -1 : Number(job.best_score);
  let bestProvider = job.best_provider ?? null;
  let bestHtml: string | null = null;      // only set when THIS slice improves on it
  let notes: string[] = safeJson(job.notes ?? "[]") ?? [];

  /* A job that has been sitting unworked for a day is given up on rather than
     left holding a creator's ACUs for ever. */
  if (job.created_at && Date.now() - Date.parse(job.created_at) > ABANDON_HOURS * 3600_000) {
    return await failRun(sql, job, engineHtml, acuHeld, attempts,
      `abandoned after ${ABANDON_HOURS} hours with no worker able to finish it`);
  }

  while (true) {
    /* ENOUGH TIME TO START ANOTHER ATTEMPT? An attempt that cannot finish inside
       this slice is not wasted — the provider call is simply not made, and the
       next slice makes it. This is the check that turns a hard platform ceiling
       into a pause.
       MIN_ATTEMPT_MS is what the measured runs actually take: the 18 Aug probe
       recorded 24.6s, 39.2s and 159.1s for one full-size generation. Starting an
       attempt with less than 45 seconds left buys a near-certain abort, which
       costs the tokens AND produces nothing — the exact trade this whole change
       exists to stop. */
    if (sliceDeadline - Date.now() < MIN_ATTEMPT_MS) {
      await saveProgress(sql, job.ticket, { attempts, stale, acuHeld, notes, bestHtml, bestProvider, bestScore });
      await releaseLease(sql, job.ticket);
      return { status: "running", attempts, acuHeld };
    }

    /* CAN THE WALLET FUND ANOTHER ATTEMPT? This is the only spending bound left,
       and it is the honest one: a run stops when the money stops, not at a number
       chosen in advance. A wallet that can afford attempt eleven gets it.

       Checked against what an attempt can cost AT FULL STRETCH, not against the
       metered floor. debitWallet is all-or-nothing and happens after the attempt,
       so a balance that only covers the floor would buy a whole generation the
       creator cannot pay for — free AI arriving through the back door, which the
       standing rule forbids however it happens. */
    if (job.wallet_id) {
      const w = await getWallet(sql, job.wallet_id);
      const balance = w ? Number((w as any).balance ?? 0) : 0;
      const needed = worstAttemptAcu(is3d);
      if (balance < needed) {
        /* Deliver the best build the run DID produce rather than nothing: a
           creator out of ACUs mid-run still gets what their ACUs bought. */
        return await concludeRun(sql, job, {
          engineHtml, acuHeld, attempts, notes, is3d,
          reason: attempts === 0
            ? `not enough ACUs to run a build attempt (${needed} needed, ${balance} available) — top up at /wallet.html`
            : `ran out of ACUs after ${attempts} attempt${attempts === 1 ? "" : "s"} `
              + `(${needed} needed for another, ${balance} left) — top up at /wallet.html to keep refining`,
        });
      }
    }

    attempts++;
    let usage: TokenUsage | undefined;
    let provider = "";
    let verdict: BuildVerdict | null = null;
    let html: string | null = null;
    const started = Date.now();

    try {
      const ai = await generateGameHtml(job.concept, {
        title: job.title ?? undefined, summary: job.summary ?? undefined,
        language: job.language ?? undefined, mode: is3d ? "3d" : "2d",
        feedback: notes, attempt: attempts,
        /* The slice owns the clock, not the request. Without this the chain would
           budget as though a whole maxDuration were still available. */
        deadline: sliceDeadline,
      });
      provider = ai.provider;
      usage = ai.usage;
      html = ai.html;
      /* Judge here too rather than trusting the chain's own verdict to exist:
         the chain returns its best sub-floor build when every provider missed,
         and that is precisely the case a retry exists to improve on. */
      verdict = ai.verdict ?? judgeBuild(ai.html, is3d);
    } catch (err: any) {
      notes = [String(err?.message ?? err).slice(0, 600)];
    }

    /* CHARGE WHAT THIS ATTEMPT ACTUALLY COST, as it happens. A run that spends
       more than one fixed hold is the entire point, so the debit cannot be a
       single up-front guess any more. */
    if (provider && provider !== "demo" && job.wallet_id) {
      const cost = meteredCost(provider, usage);
      const after = await debitWallet(sql, job.wallet_id, cost);
      /* debitWallet is all-or-nothing: it returns null WITHOUT taking anything
         when the balance cannot cover the cost. So `acuHeld` may only grow when
         the debit actually succeeded — it is the figure the hold is written with,
         and a hold larger than what left the wallet would refund the creator
         money they never paid. The balance moving under a run mid-attempt is
         rare but real (a concurrent forge, an admin adjustment); the platform
         absorbs that attempt's provider cost and the balance check at the top of
         the loop ends the run on the next pass. */
      if (after !== null) acuHeld += cost;
      else notes = notes.concat("the wallet went short during this attempt, so it was not charged for it");
    }

    try {
      await recordForgeLog(sql, {
        provider: provider || "none", mode: is3d ? "3d" : "2d", ms: Date.now() - started,
        error: verdict && !verdict.ok ? verdict.notes.join(" | ").slice(0, 600) : (notes.length ? notes.join(" | ").slice(0, 600) : null),
        bytes: html ? html.length : 0, models: html ? countLibraryModels(html) : 0,
      });
    } catch { /* logging is best-effort; it must never end a run */ }

    /* THE EXPECTED RESULT: a build that clears every floor and renders. */
    if (html && verdict?.ok && provider !== "demo" && looksPlayable(html)) {
      return await succeedRun(sql, job, {
        html, provider, engineHtml, acuHeld, attempts,
      });
    }

    /* Not good enough. Keep it only if it is the best so far, and hand its exact
       reasons to the next attempt as requirements. */
    const score = verdict ? verdict.score : -1;
    /* NEVER the demo build. With no provider keys configured the gateway returns
       a tiny hand-written game so the flow stays testable offline; it is weaker
       than the deterministic engine build, so keeping it as "best" would ship
       something worse than the fallback AND report it as a bespoke AI build. */
    if (html && verdict && provider !== "demo" && verdict.keepAsFallback && score > bestScore) {
      bestScore = score; bestHtml = html; bestProvider = provider; stale = 0;
    } else {
      stale++;
    }
    if (verdict && !verdict.ok) notes = verdict.notes.slice(0, 8);

    /* STOPPING BECAUSE IT IS NOT GETTING CLOSER — never because a counter ran
       out. An improving run is never stopped here. */
    if (stale >= MAX_STALE_ATTEMPTS) {
      await saveProgress(sql, job.ticket, { attempts, stale, acuHeld, notes, bestHtml, bestProvider, bestScore });
      return await concludeRun(sql, job, {
        engineHtml, acuHeld, attempts, notes, is3d,
        reason: `${attempts} attempts, and the last ${stale} came no closer than the best — ` +
                `stopped rather than buying the same failure again. Last refusal: ${notes.join("; ").slice(0, 300)}`,
      });
    }

    await saveProgress(sql, job.ticket, { attempts, stale, acuHeld, notes, bestHtml, bestProvider, bestScore });
    bestHtml = null;   // persisted; don't rewrite it on the next pass
  }
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/** Read back the best build the run stored, which may predate this slice. */
async function storedBest(sql: Sql, ticket: string): Promise<{ html: string | null; provider: string | null }> {
  const rows = (await sql`SELECT best_html, best_provider FROM forge_jobs WHERE ticket = ${ticket}`) as any[];
  return { html: rows.length ? rows[0].best_html : null, provider: rows.length ? rows[0].best_provider : null };
}

/**
 * Build the response body, in EXACTLY the shape /api/forge-game used to return.
 * The Studio already knows how to consume this and how to poll for it, and a
 * second response shape would have meant a second client path to maintain.
 */
async function buildPayload(sql: Sql, job: ForgeJob, p: {
  html: string; provider: string; engineHtml: string; acuHeld: number; attempts: number;
  bespokeError?: string;
}) {
  /* Only a real AI build reaches here — failRun owns the engine-only outcome and
     writes its own body, because that path refunds rather than holds.
     The hold IS the run's metered cost now, so accept collects it and discard
     hands it back: the existing charge-on-accept row, unchanged. */
  const settle = Math.max(FORGE_MIN_CHARGE, p.acuHeld);
  let forgeId: string | undefined;
  if (job.wallet_id && p.acuHeld > 0) {
    forgeId = randomUUID();
    try { await recordForgeHold(sql, forgeId, job.wallet_id, p.acuHeld, settle); } catch { forgeId = undefined; }
  }
  let balanceAfter: number | null = null;
  if (job.wallet_id) {
    try { const w = await getWallet(sql, job.wallet_id); balanceAfter = w ? Number((w as any).balance ?? 0) : null; } catch { /* display only */ }
  }
  return {
    html: p.html,
    provider: p.provider,
    acuCharge: settle,
    acuHeld: p.acuHeld,
    acuOnAccept: settle,
    chargedOnAccept: true,
    attempts: p.attempts,
    ...(p.bespokeError ? { bespokeError: p.bespokeError } : {}),
    fallbackHtml: p.engineHtml,
    ...(forgeId ? { forgeId } : {}),
    ...(balanceAfter !== null ? { balanceAfter } : {}),
  };
}

async function succeedRun(sql: Sql, job: ForgeJob, p: {
  html: string; provider: string; engineHtml: string; acuHeld: number; attempts: number;
}): Promise<SliceOutcome> {
  const body = await buildPayload(sql, job, p);
  const json = JSON.stringify(body);
  await finishJob(sql, job.ticket, "succeeded", json);
  /* The Studio's existing poller reads /api/forge-result, so the finished build
     lands there too. One delivery channel, two readers. */
  try { await saveForgeResult(sql, job.ticket, job.wallet_id, json); } catch { /* the job row is the record */ }
  return { status: "succeeded", attempts: p.attempts, acuHeld: p.acuHeld, provider: p.provider };
}

/**
 * The run is over without a build that cleared every floor. Ship the best thing
 * that exists — the best sub-floor build if there is one, the deterministic
 * engine build if not — and say plainly why it is not the bespoke game.
 */
async function concludeRun(sql: Sql, job: ForgeJob, p: {
  engineHtml: string; acuHeld: number; attempts: number; notes: string[]; is3d: boolean; reason: string;
}): Promise<SliceOutcome> {
  const best = await storedBest(sql, job.ticket);
  if (best.html && looksPlayable(best.html)) {
    const body = await buildPayload(sql, job, {
      html: best.html, provider: best.provider || "ai", engineHtml: p.engineHtml,
      acuHeld: p.acuHeld, attempts: p.attempts, bespokeError: p.reason,
    });
    const json = JSON.stringify(body);
    await finishJob(sql, job.ticket, "succeeded", json, p.reason);
    try { await saveForgeResult(sql, job.ticket, job.wallet_id, json); } catch { /* job row is the record */ }
    return { status: "succeeded", attempts: p.attempts, acuHeld: p.acuHeld, provider: best.provider || "ai", reason: p.reason };
  }
  return await failRun(sql, job, p.engineHtml, p.acuHeld, p.attempts, p.reason);
}

/**
 * Nothing usable came out of the AI at all. The engine build ships so the creator
 * still has something playable, and every ACU the AI spent goes back: /refunds
 * says "you never pay for a failed forge", and a run that produced no bespoke game
 * is a failed forge whatever it cost the platform.
 *
 * The flat ENGINE_BUILD_CHARGE for the deterministic build is kept, because it was
 * the behaviour before this change and it is a real charge for a real deliverable
 * — but it is now taken as its own small hold AFTER the AI money is returned,
 * rather than settled out of an up-front reservation that no longer exists. If the
 * wallet cannot cover even that, the build still ships and nothing is charged: a
 * creator whose run just failed must never be left owing.
 */
async function failRun(sql: Sql, job: ForgeJob, engineHtml: string, acuHeld: number, attempts: number, reason: string): Promise<SliceOutcome> {
  if (job.wallet_id && acuHeld > 0) {
    try { await creditWallet(sql, job.wallet_id, acuHeld); } catch { /* reconciliation catches strays */ }
  }

  /* The engine charge, taken only if it can be. A hold row is written ONLY when
     the debit succeeded, because a forge_charges row whose money never left the
     wallet would make accept believe it collected something it did not. */
  let forgeId: string | undefined;
  let engineHeld = 0;
  if (job.wallet_id) {
    try {
      const after = await debitWallet(sql, job.wallet_id, ENGINE_BUILD_CHARGE);
      if (after !== null) {
        engineHeld = ENGINE_BUILD_CHARGE;
        forgeId = randomUUID();
        await recordForgeHold(sql, forgeId, job.wallet_id, engineHeld, ENGINE_BUILD_CHARGE);
      }
    } catch { forgeId = undefined; engineHeld = 0; }
  }

  const body = {
    html: engineHtml,
    provider: "engine",
    acuCharge: engineHeld,
    acuHeld: engineHeld,
    acuOnAccept: engineHeld,
    chargedOnAccept: true,
    attempts,
    bespokeError: reason,
    refunded: acuHeld,
    ...(forgeId ? { forgeId } : {}),
  };
  const json = JSON.stringify(body);
  await finishJob(sql, job.ticket, "failed", json, reason);
  try { await saveForgeResult(sql, job.ticket, job.wallet_id, json); } catch { /* job row is the record */ }
  return { status: "failed", attempts, acuHeld: engineHeld, reason };
}
