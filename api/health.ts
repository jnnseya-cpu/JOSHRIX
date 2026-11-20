/**
 * GET /api/health — deployment + provider readiness (booleans only, never key material).
 *
 * WHY `mode` IS COMPUTED THE WAY IT IS. It used to read
 *   mode: process.env.ANTHROPIC_API_KEY ? "live" : "demo"
 * which asks the wrong question twice over. The forge chain is
 * [gemini, openai, claude] — Anthropic is the LAST provider tried, chosen last
 * on measured truncation (159s, no closing </html>, recorded in _gateway.ts).
 * So a deployment carrying only GEMINI_API_KEY — the provider the probe says is
 * the only one returning a complete full-size build — reported "demo" and looked
 * broken, while a deployment carrying only ANTHROPIC_API_KEY reported "live" and
 * would fall through to the deterministic engine on most runs.
 *
 * The honest answer to "can this deployment forge a game" is "is ANY provider
 * configured", and the useful follow-up is "which one goes first and how many
 * are behind it" — because a single-provider deployment has no fallback, which
 * is a different kind of healthy and the operator should be able to see it.
 */
/* NOTHING FROM THIS PLATFORM IS IMPORTED AT MODULE SCOPE.
 *
 * On 20 Nov 2026 this endpoint returned FUNCTION_INVOCATION_FAILED twice, while
 * it was the one URL being used to diagnose a payment outage. A module-scope
 * import that throws — a bad env var read at load, a provider SDK that fails to
 * initialise, a cycle — kills the function before a single line of this file
 * runs, and no try/catch inside the handler can help.
 *
 * So every dependency is loaded with a dynamic import INSIDE the handler's try.
 * The cost is a few milliseconds on a cold start. The benefit is that "is this
 * deployment well" is a question that can always be answered, which is the only
 * reason this file exists.
 */

/** The forge chain, in the order api/_gateway.ts actually tries it. Kept as a
 *  literal here rather than exported from the gateway because it describes the
 *  ORDER, and the gateway builds its candidates inline per request. If that
 *  order changes, tests/t10 fails on the mismatch. */
const CHAIN = ["gemini", "openai", "anthropic"] as const;

/**
 * DOES THE DATABASE ACTUALLY ANSWER.
 *
 * `ledger: !!process.env.DATABASE_URL` was a lie by omission: it reported that a
 * variable was SET, and read as though the ledger were healthy. On 17 Nov 2026
 * the Stripe webhook began returning 500 on every event because a ledger write
 * was failing, and /api/health said `ledger: true` throughout — the one
 * endpoint whose job is to answer "is this deployment well" could not see the
 * thing that was wrong.
 *
 * So it connects. One `SELECT 1`, a short timeout, and the REASON when it
 * fails: a rejected password, an unreachable host and a suspended compute all
 * need different actions, and "false" tells an operator none of them.
 *
 * The message is redacted before it is returned, because a Postgres driver puts
 * the connection string — password included — in the message when it cannot
 * connect, and this endpoint is public.
 */
async function ledgerProbe(
  classify: (e: unknown) => string,
  redact: (t: string) => string,
): Promise<{ configured: boolean; reachable: boolean | null; ms: number | null; error?: string; category?: string }> {
  const configured = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  if (!configured) return { configured: false, reachable: null, ms: null };

  let sql: any;
  let getDbError: () => string | null = () => null;
  try {
    const ledgerMod = await import("./_ledger.js");
    getDbError = ledgerMod.getDbError;
    /* getDb parses the connection URL. A malformed one throws HERE, before any
       query, and an unguarded throw at this point is what took the whole
       function down on 20 Nov 2026 — a health endpoint that cannot survive a
       bad DATABASE_URL cannot report a bad DATABASE_URL. */
    sql = ledgerMod.getDb();
  } catch (err: any) {
    return { configured: true, reachable: false, ms: null, error: redact(String(err?.message ?? err)).slice(0, 300), category: classify(err) };
  }
  if (!sql) {
    /* Configured but no client: the URL is malformed. getDb() keeps the reason
       so this reads as "your DATABASE_URL is wrong" rather than "not set". */
    const why = getDbError();
    return why
      ? { configured: true, reachable: false, ms: null, error: why, category: "database" }
      : { configured: true, reachable: null, ms: null, error: "no client could be created from the configured URL" };
  }

  const t0 = Date.now();
  let timer: any = null;
  try {
    /* TWO RULES, AND THE FIRST VERSION BROKE BOTH.
     *
     * A `Promise.race` leaves the LOSER unsettled. When the query won, the
     * 5-second timer still fired and rejected a promise nobody was listening
     * to any more — an unhandled rejection, which on this platform fails the
     * whole invocation. So the timer is cleared in `finally`, and the query is
     * given a no-op catch so that a late failure after a timeout cannot
     * surface the same way. */
    const probe = sql`SELECT 1`;
    probe.catch(() => { /* the race loser must never become an unhandled rejection */ });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("database probe timed out after 5000ms")), 5_000);
    });
    await Promise.race([probe, timeout]);
    return { configured: true, reachable: true, ms: Date.now() - t0 };
  } catch (err: any) {
    const message = redact(String(err?.message ?? err)).slice(0, 300);
    return { configured: true, reachable: false, ms: Date.now() - t0, error: message, category: classify(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function handler(_req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  /* THIS ENDPOINT MUST ALWAYS ANSWER.
   *
   * On 20 Nov 2026 it returned FUNCTION_INVOCATION_FAILED — a 500 from the
   * platform, not from this code — while it was the one URL being used to
   * diagnose a payment outage. Whatever else is broken, an operator asking "is
   * this deployment well" has to get a reply, so everything below the headers
   * is wrapped and the worst case is a 200 that says the check itself failed. */
  try {
    /* Loaded here, not at the top of the file. See the note above. */
    const gateway = await import("./_gateway.js");
    const observe = await import("./_observe.js");
    const providers = gateway.providerStatus();
    const ready = CHAIN.filter((p) => providers[p as keyof typeof providers]);
    const ledger = await ledgerProbe(observe.classify, observe.redact);

    return res.status(200).json({
      /* `ok` stops being true when the database is configured and refusing. A
         health endpoint that says ok while settlement is failing is worse than
         no health endpoint. */
      ok: ledger.reachable !== false,
      service: "joshrix-studio",
      build: gateway.BUILD_ID,
      layers: { frontend: "static /frontend", backend: "serverless /api", shared: "shared/contracts.ts" },
      providers,
      /* Kept as a boolean for anything that already reads it, but it now means
         "the database answered", not "a variable is set". */
      ledger: ledger.reachable === true,
      database: ledger,
      moderation: !!process.env.MODERATION_KEY,
      stripe: { checkout: !!process.env.STRIPE_SECRET_KEY, webhook: !!process.env.STRIPE_WEBHOOK_SECRET },
      forge: {
        /** Which provider a forge would try first, or null if none can run. */
        leadProvider: ready[0] ?? null,
        /** How many are behind it. 0 means a single vendor outage stops every build. */
        fallbacks: Math.max(0, ready.length - 1),
        ready,
      },
      mode: ready.length
        ? "live"
        : "demo (no AI provider key is set — every build would fall back to the deterministic engine)",
    });
  } catch (err: any) {
    /* Last resort. Still 200, because the question asked was "are you there"
       and the answer is yes — with the reason this check could not complete.
       Deliberately NOT redact() from _observe: if that module is what failed to
       load, calling into it here would fail the fallback too. Scrubbed locally
       and into a variable first, so no raw error string is ever handed to a
       response field — tests/t50 sweeps for exactly that. */
    const scrubbed = String(err?.message ?? err)
      .replace(/postgres(?:ql)?:\/\/[^\s]*/gi, "postgresql://<redacted>")
      .replace(/Connection string:\s*\S*/gi, "Connection string: <redacted>")
      .slice(0, 300);
    return res.status(200).json({
      ok: false,
      service: "joshrix-studio",
      error: "the health check itself failed",
      detail: scrubbed,
    });
  }
}
