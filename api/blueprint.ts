/**
 * POST /api/blueprint — Idea Agent endpoint.
 * Body: { prompt: string, type?: string, platform?: string, scope?: string }
 * Returns: { blueprint, provider, acuCharge }
 */
import { generateBlueprint, BLUEPRINT_ACU_CHARGE } from "./_gateway";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { prompt, type, platform, scope, language } = (req.body ?? {}) as Record<string, string>;
  if (!prompt || typeof prompt !== "string" || prompt.length < 4) {
    return res.status(400).json({ error: "Body must include a game description in `prompt`." });
  }
  if (prompt.length > 20000) {
    return res.status(400).json({ error: "Prompt too long (max 20,000 chars)." });
  }
  try {
    const { blueprint, provider } = await generateBlueprint(prompt, { type, platform, scope, language });
    return res.status(200).json({ blueprint, provider, acuCharge: BLUEPRINT_ACU_CHARGE });
  } catch (err: any) {
    return res.status(502).json({ error: "Blueprint generation failed", detail: String(err?.message ?? err) });
  }
}
