/**
 * GET /api/forge-result?ticket=<uuid>&w=<walletId>
 *
 * WHAT A FORGE IS DOING, and the finished game when there is one.
 *
 * This began as a second delivery channel: forge-game persisted every completed
 * build under the client's ticket before responding, so a dropped connection
 * could not lose a finished forge. Now that a forge is a durable job that runs
 * across many function invocations, this is the PRIMARY channel — and it has to
 * answer a question it never used to: not just "is it ready" but "is it still
 * working, and how is it going".
 *
 * That matters more than it sounds. A run that takes four attempts is a run where
 * a creator stares at a progress screen for several minutes, and "please wait"
 * with no detail is indistinguishable from a hang. So progress reports the real
 * attempt count and the real reason the last attempt was refused, both read from
 * the job row rather than estimated on the client.
 *
 * Wallet-bound: only the wallet that owns the forge may read it. The finished
 * payload contains the game's full source, so this check is the paywall's
 * neighbour and gets the same treatment — compared server-side, exact match, and
 * a job with no wallet at all is readable by nobody.
 */
import { getDb, ensureGameSchema, getForgeResult } from "./_ledger";
import { ensureForgeJobSchema, getForgeJob, MAX_STALE_ATTEMPTS } from "./_forgejobs";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const ticket = String(req.query?.ticket || "");
  const w = String(req.query?.w || "");
  if (!/^[a-z0-9-]{8,64}$/i.test(ticket)) return res.status(400).json({ error: "valid ticket required" });

  const sql = getDb();
  if (!sql) return res.status(200).json({ ready: false, reason: "no ledger" });

  try {
    await ensureGameSchema(sql);

    /* The finished build first: a completed run is the common case a poller is
       asking about, and forge_results is the older, narrower table. */
    const row = await getForgeResult(sql, ticket);
    if (row) {
      if (row.wallet_id && row.wallet_id !== w) return res.status(403).json({ error: "not your forge" });
      return res.status(200).json({ ready: true, ...JSON.parse(row.payload) });
    }

    /* Not finished. Report what the job is actually doing. */
    await ensureForgeJobSchema(sql);
    const job = await getForgeJob(sql, ticket);
    if (!job) return res.status(200).json({ ready: false });
    if (job.wallet_id && job.wallet_id !== w) return res.status(403).json({ error: "not your forge" });

    /* A finished job whose payload never reached forge_results still delivers
       from here — the job row is the record of the run, and losing a completed
       build to a failed secondary write is the exact failure this pair exists
       to prevent. */
    if ((job.status === "succeeded" || job.status === "failed") && job.payload) {
      return res.status(200).json({ ready: true, ...JSON.parse(job.payload) });
    }

    const notes: string[] = safeArray(job.notes);
    return res.status(200).json({
      ready: false,
      status: job.status,
      attempts: Number(job.attempts) || 0,
      /* The creator-facing version of the retry loop's stop condition, so the
         screen can say "attempt 3, two tries left if it stops improving"
         rather than counting silently. */
      staleAllowance: MAX_STALE_ATTEMPTS,
      stale: Number(job.stale) || 0,
      acuSpent: Number(job.acu_held) || 0,
      /* WHY the last attempt was refused, in the same words the model was given.
         This is the line that turns a spinner into an explanation. */
      lastRefusal: notes.length ? notes.join("; ").slice(0, 400) : null,
      startedAt: job.created_at ?? null,
    });
  } catch (err: any) {
    return res.status(502).json({ error: "lookup failed", detail: String(err?.message ?? err) });
  }
}

function safeArray(s: string | null): string[] {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
