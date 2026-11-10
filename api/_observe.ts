/**
 * WHEN SOMETHING FAILS IN PRODUCTION, SOMEBODY HAS TO BE ABLE TO FIND OUT.
 *
 * `launch-audit/human-actions.md` item 3: "nothing watches production. Until
 * then the first production failure reaches you as a complaint from the person
 * it happened to." That item asked for Sentry and a DSN, which is Justin's to
 * buy. This is the part that needed no vendor and no key, and should not have
 * waited for one.
 *
 * WHAT WAS ACTUALLY WRONG, in three parts.
 *
 * 1. Thirty-three handlers ended in the same shape:
 *    `catch (err) { res.status(502).json({ error: "...", detail: String(err.message) }) }`.
 *    The failure existed for exactly as long as the request did. Nothing counted
 *    it, nothing aggregated it, and the only record was a line in a log nobody
 *    opens until someone complains.
 *
 * 2. That `detail` went to the CALLER. A database error carries table names,
 *    column names and sometimes a host; a provider error carries its own
 *    internals. Handing that to whoever made the request is information
 *    disclosure in exchange for nothing, because the one person who needs it is
 *    the operator.
 *
 * 3. `api/security-agent.ts` ran nightly, built findings, and when the worst was
 *    critical or high it wrote a row to `security_events` — a table nobody
 *    reads. The watchman was writing notes to himself. It emails now.
 *
 * WHAT A CORRELATION ID BUYS. The caller is told "reference a1b2c3d4" and
 * nothing else. That one string is in the response, in the structured log line
 * and on the stored row, so "it broke when I pressed the button" becomes a
 * primary key. Without it, matching a complaint to a failure means guessing from
 * timestamps.
 *
 * WHAT THIS IS NOT. It is not tracing, it is not a dashboard, and it does not
 * page anyone at 3am. It captures failures, counts them, keeps them for 30 days
 * and puts them in the one mail that already goes out. A hosted error service
 * does more; this works today with no DSN, no new processor of user data, and no
 * second system to keep alive.
 */
import { getDb, ensureErrorSchema, recordError } from "./_ledger";

/** Opaque, short, and safe to read aloud down a phone. Not a secret and not a
 *  session identifier — it names one failure, nothing else. */
export function correlationId(): string {
  return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
}

export type FailureCategory = "database" | "provider" | "payment" | "validation" | "timeout" | "unknown";

/**
 * STRIP CREDENTIALS BEFORE ANYTHING IS WRITTEN DOWN.
 *
 * This is not defensive padding. A Postgres driver that cannot connect puts the
 * connection string in the message, password included. A provider SDK can echo
 * the key it was handed. The moment such a message is stored in `error_events`
 * or printed to a log, the credential is in a place it was never meant to be —
 * and `tests/t32` exists precisely because this platform has already published a
 * live database password once, in a row whose own text said "rotate this".
 *
 * The patterns are the same ones t32 scans the repository for, so a secret that
 * would be caught in a commit is also caught on its way into a log line.
 */
export function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/gi, "postgresql://<redacted>@")
    .replace(/\b(?:sk-ant-|sk-proj-|sk_live_|sk_test_|rk_live_|whsec_|npg_|ghp_|xox[baprs]-)[A-Za-z0-9_-]{6,}/g, "<redacted-key>")
    .replace(/\bAIza[0-9A-Za-z_-]{10,}/g, "<redacted-key>")
    .replace(/\bAKIA[0-9A-Z]{8,}/g, "<redacted-key>")
    /* `Authorization: Bearer <jwt>` needs the SCHEME WORD consumed as well as
       the separator. An earlier version matched only up to the next
       whitespace, so it replaced "Authorization: Bearer" and left the token
       sitting in the open — a redaction that removed the label and kept the
       secret. Named groups would not have helped; running the test did. */
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 <redacted>")
    .replace(/\b(authorization|api[-_]?key|password|passwd|secret|token|credential)\b\s*[:=]\s*(?:bearer\s+|basic\s+)?\S+/gi,
      (_m, name: string) => `${name}=<redacted>`);
}

/**
 * Classify from the message, deterministically, with no model involved.
 *
 * The category is what makes a daily digest readable: forty "database" failures
 * in an hour is one incident, while forty "provider" failures is somebody
 * else's outage and needs a different reaction. Deliberately coarse — a
 * taxonomy nobody can remember is a taxonomy nobody uses.
 */
export function classify(err: unknown): FailureCategory {
  const m = String((err as any)?.message ?? err ?? "").toLowerCase();
  if (/timeout|timed out|etimedout|abort/.test(m)) return "timeout";
  if (/database|postgres|neon|relation .* does not exist|column|duplicate key|deadlock|connection terminated/.test(m)) return "database";
  if (/stripe|webhook|payment|charge|invoice/.test(m)) return "payment";
  if (/anthropic|openai|gemini|rate limit|overloaded|model|api key/.test(m)) return "provider";
  if (/invalid|required|must be|validation|unexpected token|json/.test(m)) return "validation";
  return "unknown";
}

/**
 * The single way a handler reports that it could not do its job.
 *
 * Replaces thirty-three hand-rolled catch blocks. It records the failure, logs
 * it in the structured shape CLAUDE.md rule 38 asks for — operation, time,
 * correlation id, result, category — and answers the caller with a sentence and
 * a reference, never with the underlying error.
 *
 * It opens its own database handle rather than taking one, because several of
 * those catch blocks sat where `sql` was not in scope, and an observability
 * helper that is awkward to call from the place things break is an
 * observability helper that does not get called.
 *
 * Nothing in here may throw. A failure to record a failure must not become the
 * response the user sees, so every step is wrapped and the HTTP answer is sent
 * whatever happens.
 */
export async function failing(
  res: any, operation: string, err: unknown,
  message = "That did not work. The failure has been recorded.",
  /** `extra` exists for the one caller whose client reads another field —
   *  /api/payout answers `queued: false`, and dropping it to tidy this
   *  signature would change what the page does on a failure. */
  opts: { status?: number; extra?: Record<string, unknown> } = {},
): Promise<any> {
  const status = opts.status ?? 502;
  const ref = correlationId();
  const category = classify(err);
  /* Redacted BEFORE the log line and before the row, not somewhere downstream.
     There is no code path here that touches the raw message twice. */
  const detail = redact(String((err as any)?.message ?? err ?? "unknown error")).slice(0, 500);

  /* Logged first and unconditionally: this line survives even when the database
     is the thing that is broken, which is exactly when it matters most. */
  try {
    console.error(JSON.stringify({
      failure: { operation, category, reference: ref, at: new Date().toISOString(), detail },
    }));
  } catch { /* a logger that throws must not take the request with it */ }

  try {
    const sql = getDb();
    if (sql) {
      await ensureErrorSchema(sql);
      await recordError(sql, { operation, category, reference: ref, message: detail });
    }
  } catch { /* observation must never break the thing observed */ }

  /* The caller gets a sentence and a reference. The reference is the whole
     point: it turns "it broke" into a row somebody can look up. */
  return res.status(status).json({ ...(opts.extra ?? {}), error: message, reference: ref });
}
