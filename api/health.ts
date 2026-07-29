/**
 * GET /api/health — deployment + provider readiness (booleans only, never key material).
 */
import { providerStatus, BUILD_ID } from "./_gateway";

export default function handler(_req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    ok: true,
    service: "joshrix-studio",
    build: BUILD_ID,
    layers: { frontend: "static /frontend", backend: "serverless /api", shared: "shared/contracts.ts" },
    providers: providerStatus(),
    ledger: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    stripe: { checkout: !!process.env.STRIPE_SECRET_KEY, webhook: !!process.env.STRIPE_WEBHOOK_SECRET },
    mode: process.env.ANTHROPIC_API_KEY ? "live" : "demo (add ANTHROPIC_API_KEY to go live)",
  });
}
