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

/** The forge chain, in the order api/_gateway.ts actually tries it. Kept as a
 *  literal here rather than exported from the gateway because it describes the
 *  ORDER, and the gateway builds its candidates inline per request. If that
 *  order changes, tests/t10 fails on the mismatch. */
const CHAIN = ["gemini", "openai", "anthropic"] as const;

export default function handler(_req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const providers = providerStatus();
  const ready = CHAIN.filter((p) => providers[p as keyof typeof providers]);

  res.status(200).json({
    ok: true,
    service: "joshrix-studio",
    build: BUILD_ID,
    layers: { frontend: "static /frontend", backend: "serverless /api", shared: "shared/contracts.ts" },
    providers,
    ledger: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL),
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
