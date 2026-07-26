/**
 * JOSHRIX Studio backend — Firebase Cloud Functions (2nd gen).
 * One HTTPS function `api` routes:
 *   GET  /health     (also /api/health)     — readiness + provider booleans
 *   POST /blueprint  (also /api/blueprint)  — Idea Agent (Claude primary, demo fallback)
 * Secret: firebase functions:secrets:set ANTHROPIC_API_KEY   (fresh key only — never a previously pasted one)
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { generateBlueprint, providerStatus, BLUEPRINT_ACU_CHARGE } from "./gateway";

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

export const api = onRequest(
  {
    region: "europe-west2",
    cors: true,
    timeoutSeconds: 60,
    memory: "512MiB",
    secrets: [ANTHROPIC_API_KEY],
  },
  async (req, res) => {
    const path = req.path.replace(/^\/api(?=\/|$)/, "") || "/";

    if (path === "/health") {
      res.status(200).json({
        ok: true,
        service: "joshrix-studio",
        layers: { backend: "firebase functions (europe-west2)", shared: "shared/contracts.ts (bundled)", frontend: "vercel static" },
        providers: providerStatus(),
        mode: process.env.ANTHROPIC_API_KEY ? "live" : "demo (set the ANTHROPIC_API_KEY secret to go live)",
      });
      return;
    }

    if (path === "/blueprint") {
      if (req.method !== "POST") {
        res.status(405).json({ error: "POST only" });
        return;
      }
      const { prompt, type, platform, scope, language } = (req.body ?? {}) as Record<string, string>;
      if (!prompt || typeof prompt !== "string" || prompt.length < 4) {
        res.status(400).json({ error: "Body must include a game description in `prompt`." });
        return;
      }
      if (prompt.length > 4000) {
        res.status(400).json({ error: "Prompt too long (max 4000 chars)." });
        return;
      }
      try {
        const { blueprint, provider } = await generateBlueprint(prompt, { type, platform, scope, language });
        res.status(200).json({ blueprint, provider, acuCharge: BLUEPRINT_ACU_CHARGE });
      } catch (err: unknown) {
        res.status(502).json({ error: "Blueprint generation failed", detail: String((err as Error)?.message ?? err) });
      }
      return;
    }

    res.status(404).json({ error: "Not found", routes: ["GET /health", "POST /blueprint"] });
  },
);
