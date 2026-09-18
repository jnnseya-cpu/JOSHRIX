/**
 * POST /api/forge-worker — advance a forge job by one slice.
 *
 * This is the thing that makes "no time limit" true. A serverless function
 * cannot run for an hour, but a job can be advanced by sixty functions. Each
 * invocation claims one job, does as much as fits safely inside one maxDuration,
 * writes its state to Postgres, and returns. The run continues in the next one.
 *
 * THREE CALLERS, THREE DIFFERENT RIGHTS.
 *
 *   The creator's own browser, with { ticket, walletId }. Authorised by
 *   OWNERSHIP, not by a secret: the wallet on the request must be the wallet on
 *   the job. This is the normal path and it is why a forge makes progress at
 *   browser speed while someone is watching — the Studio is already polling
 *   every six seconds, so every poll can also push the work forward.
 *
 *   The cron, with Authorization: Bearer CRON_SECRET, sweeping whatever is
 *   waiting. This is what finishes a run for a creator who closed the tab, and
 *   what makes the promise durable rather than dependent on a browser staying
 *   open. It may advance ANY job, which is exactly why it needs the secret.
 *
 *   An operator, with x-moderation-key, for diagnosis. Same pattern as every
 *   other privileged endpoint here.
 *
 * WHY A BROWSER MAY DRIVE A PAID LOOP AT ALL. Every attempt costs real provider
 * money, so this endpoint would be a denial-of-wallet hole if any of that were
 * decided by the client. None of it is. The concept, the mode, the wallet and the
 * attempt history are all read from the job row that /api/forge-game wrote; the
 * request body contributes nothing but "which job, and prove it is yours". The
 * lease means two callers cannot run two attempts at once, and the wallet
 * balance bounds the spend. A caller can therefore make their own forge finish
 * sooner. They cannot make it cost more than they have, and they cannot touch
 * anyone else's.
 */
import { getDb, ensureGameSchema } from "./_ledger";
import {
  ensureForgeJobSchema, claimForgeJob, runForgeJobSlice, getForgeJob,
} from "./_forgejobs";
import { FORGE_MAX_SECONDS } from "./_gateway";
import { clientIp, rateLimit, tooMany, forgeDisabled, ledgerRequired } from "./_guard";

/** Leave room after the slice to write state and reply — the same discipline as
 *  the generation budgets, applied to the function that owns them. */
const SLICE_MS = Math.max(30_000, (FORGE_MAX_SECONDS - 10) * 1000);

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  /* Vercel Cron issues a GET. Both verbs do the same work; nothing here is
     cacheable, so GET is accepted rather than fought with. */
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "POST or GET" });

  const sql = getDb();
  const noLedger = ledgerRequired(sql);
  if (noLedger) return res.status(503).json({ error: noLedger, mode: "no_ledger" });

  /* The kill switch stops NEW work, including new slices of existing jobs: an
     incident is exactly when a paid loop must not keep buying attempts. */
  const paused = forgeDisabled();
  if (paused) return res.status(503).json({ error: paused });

  const cron = process.env.CRON_SECRET;
  const modKey = process.env.MODERATION_KEY;
  const byCron = !!cron && String(req.headers?.["authorization"] ?? "") === `Bearer ${cron}`;
  const byOperator = !!modKey && String(req.headers?.["x-moderation-key"] ?? "") === modKey;

  const ticket = String(req.body?.ticket ?? req.query?.ticket ?? "");
  const walletId = String(req.body?.walletId ?? req.query?.w ?? "");

  let job = null as Awaited<ReturnType<typeof claimForgeJob>>;
  try {
    await ensureGameSchema(sql!);
    await ensureForgeJobSchema(sql!);

    if (byCron || byOperator) {
      /* Privileged sweep: take the named job, or the oldest waiting one. */
      job = await claimForgeJob(sql!, ticket || undefined);
    } else {
      /* Unprivileged. A ticket is mandatory — there is no "give me any job" for
         an anonymous caller, because that would let anyone spend any wallet. */
      if (!/^[a-z0-9-]{8,64}$/i.test(ticket)) {
        return res.status(400).json({ error: "valid ticket required" });
      }
      /* Modest per-IP limit. The lease already stops concurrent slices and the
         balance bounds the cost, so this exists only to keep a broken client
         from hammering the claim query. */
      const rl = await rateLimit(sql!, "worker:ip:" + clientIp(req), 240, 3600);
      if (!rl.ok) return tooMany(res, rl.retryAfter, "forge progress checks");

      /* OWNERSHIP, CHECKED BEFORE THE CLAIM. Read the job, compare the wallet,
         and only then take the lease — so a wrong wallet cannot even park a
         lease on someone else's run, let alone advance it. */
      const existing = await getForgeJob(sql!, ticket);
      if (!existing) return res.status(404).json({ error: "no such forge" });
      if (existing.wallet_id && existing.wallet_id !== walletId) {
        return res.status(403).json({ error: "not your forge" });
      }
      if (existing.status === "succeeded" || existing.status === "failed") {
        return res.status(200).json({ status: existing.status, attempts: existing.attempts, done: true });
      }
      job = await claimForgeJob(sql!, ticket);
    }
  } catch (err: any) {
    return res.status(502).json({ error: "job lookup failed", detail: String(err?.message ?? err) });
  }

  /* Nothing to do is a normal, successful outcome: either the queue is empty or
     another worker holds the lease and is mid-attempt. Never an error. */
  if (!job) return res.status(200).json({ claimed: false });

  try {
    const out = await runForgeJobSlice(sql!, job, Date.now() + SLICE_MS);
    return res.status(200).json({
      claimed: true, ticket: job.ticket, ...out,
      done: out.status === "succeeded" || out.status === "failed",
    });
  } catch (err: any) {
    /* A slice that throws must not leave the job leased, or the run stalls for a
       full lease period. Hand the lease back and let the next slice retry. */
    try {
      await sql!`UPDATE forge_jobs SET lease_until = NULL, error = ${String(err?.message ?? err).slice(0, 600)},
          updated_at = now() WHERE ticket = ${job.ticket} AND status = 'running'`;
    } catch { /* the lease expires on its own */ }
    return res.status(502).json({ error: "slice failed", detail: String(err?.message ?? err) });
  }
}
