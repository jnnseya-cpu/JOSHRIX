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
import { providerStatus, BUILD_ID } from "./_gateway";
import { getDb } from "./_ledger";
import { classify, redact } from "./_observe";

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
async function ledgerProbe(): Promise<{ configured: boolean; reachable: boolean | null; ms: number | null; error?: string; category?: string }> {
  const configured = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  if (!configured) return { configured: false, reachable: null, ms: null };
  const sql = getDb();
  if (!sql) return { configured: true, reachable: null, ms: null, error: "no client could be created from the configured URL" };
  const t0 = Date.now();
  try {
    /* Bounded, so a hung connection reports a timeout instead of holding the
       health check open until the platform kills the function. */
    await Promise.race([
      sql`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("database probe timed out after 5000ms")), 5_000)),
    ]);
    return { configured: true, reachable: true, ms: Date.now() - t0 };
  } catch (err: any) {
    const message = redact(String(err?.message ?? err)).slice(0, 300);
    return { configured: true, reachable: false, ms: Date.now() - t0, error: message, category: classify(err) };
  }
}

export default async function handler(_req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const providers = providerStatus();
  const ready = CHAIN.filter((p) => providers[p as keyof typeof providers]);
  const ledger = await ledgerProbe();

  res.status(200).json({
    /* `ok` stops being true when the database is configured and refusing. A
       health endpoint that says ok while settlement is failing is worse than no
       health endpoint. */
    ok: ledger.reachable !== false,
    service: "joshrix-studio",
    build: BUILD_ID,
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
}
