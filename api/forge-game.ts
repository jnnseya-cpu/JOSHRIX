/**
 * POST /api/forge-game — the Code Agent forges a REAL playable game.
 * Body: { prompt, title?, summary?, language? }
 * Returns: { html, provider, acuCharge } — a complete self-contained HTML5 game
 * implementing the creator's concept (Claude when keys are live; a small real
 * demo game offline so the flow stays testable). Long-running: see vercel.json
 * maxDuration for this route.
 */
import { generateGameHtml, FORGE_GAME_ACU_CHARGE } from "./_gateway";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { prompt, title, summary, language } = (req.body ?? {}) as Record<string, string>;
  if (!prompt || typeof prompt !== "string" || prompt.length < 4) {
    return res.status(400).json({ error: "Body must include the game concept in `prompt`." });
  }
  if (prompt.length > 20000) {
    return res.status(400).json({ error: "Prompt too long (max 20,000 chars)." });
  }
  try {
    const { html, provider } = await generateGameHtml(prompt, { title, summary, language });
    if (!html.includes("<canvas")) {
      return res.status(502).json({ error: "Code Agent produced no playable canvas — please forge again." });
    }
    return res.status(200).json({ html, provider, acuCharge: FORGE_GAME_ACU_CHARGE });
  } catch (err: any) {
    return res.status(502).json({ error: "Game generation failed", detail: String(err?.message ?? err) });
  }
}
