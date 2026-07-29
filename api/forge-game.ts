/**
 * POST /api/forge-game — the Code Agent forges a REAL playable game.
 * Body: { prompt, title?, summary?, language?, walletId? }
 * Returns: { html, provider, acuCharge, balanceAfter? } — a complete self-contained
 * HTML5 game implementing the creator's concept. Long-running: see vercel.json.
 * Build 2 (server-side ACU enforcement): with DATABASE_URL configured the 300-ACU
 * forge charge is debited server-side BEFORE generation and refunded on failure.
 */
import { randomUUID } from "crypto";
import { generateGameHtml, FORGE_GAME_ACU_CHARGE } from "./_gateway";
import { buildPlayableGame } from "./_engine";
import { getDb, ensureGameSchema, debitWallet, creditWallet, recordForgeCharge } from "./_ledger";
import type { GameBlueprint } from "../shared/contracts";

/** Coerce whatever the client sends as a blueprint into the shape the engine needs. */
function coerceBlueprint(bp: any, prompt: string, title?: string, summary?: string, language?: string): GameBlueprint {
  const b = bp && typeof bp === "object" ? bp : {};
  return {
    language: b.language || language || "en",
    title: String(b.title || title || prompt.slice(0, 48) || "Your Game"),
    summary: String(b.summary || summary || prompt.slice(0, 160)),
    genre: Array.isArray(b.genre) && b.genre.length ? b.genre.map(String) : ["Arcade"],
    coreLoop: Array.isArray(b.coreLoop) ? b.coreLoop.map(String) : ["Play"],
    targetAudience: String(b.targetAudience || "Everyone"),
    mechanics: Array.isArray(b.mechanics) ? b.mechanics.map(String) : [],
    characters: Array.isArray(b.characters) ? b.characters.map((c: any) => ({ name: String(c?.name || "Foe"), role: String(c?.role || "") })) : [],
    levels: Array.isArray(b.levels) && b.levels.length ? b.levels.map((l: any) => ({ name: String(l?.name || "Level"), objective: String(l?.objective || "") })) : [{ name: "Level 1", objective: "Score points" }],
    monetisationModel: String(b.monetisationModel || "Freemium"),
    assetList: Array.isArray(b.assetList) ? b.assetList.map(String) : [],
    technicalComplexity: (b.technicalComplexity === "low" || b.technicalComplexity === "high") ? b.technicalComplexity : "medium",
    estimatedCredits: Number.isFinite(b.estimatedCredits) ? b.estimatedCredits : 1200,
    suggestedPriceGBP: Number.isFinite(b.suggestedPriceGBP) ? b.suggestedPriceGBP : 4.99,
    commercialScore: Number.isFinite(b.commercialScore) ? b.commercialScore : 80,
    riskScore: Number.isFinite(b.riskScore) ? b.riskScore : 15,
    marketplaceCategory: String(b.marketplaceCategory || "Arcade"),
  } as GameBlueprint;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { prompt, title, summary, language, walletId, blueprint } = (req.body ?? {}) as Record<string, any>;
  if (!prompt || typeof prompt !== "string" || prompt.length < 4) {
    return res.status(400).json({ error: "Body must include the game concept in `prompt`." });
  }
  if (prompt.length > 20000) {
    return res.status(400).json({ error: "Prompt too long (max 20,000 chars)." });
  }

  // Server-side wallet enforcement (active once DATABASE_URL is set)
  const sql = getDb();
  let balanceAfter: number | null = null;
  if (sql) {
    if (!walletId) return res.status(402).json({ error: "No wallet — open the Studio to initialise your ACU wallet, or top up at /wallet.html." });
    try {
      await ensureGameSchema(sql);
      balanceAfter = await debitWallet(sql, walletId, FORGE_GAME_ACU_CHARGE);
    } catch (err: any) {
      return res.status(502).json({ error: "Wallet check failed", detail: String(err?.message ?? err) });
    }
    if (balanceAfter === null) {
      return res.status(402).json({ error: `Not enough ACUs (forging costs ${FORGE_GAME_ACU_CHARGE}). Top up at /wallet.html.`, acuCharge: FORGE_GAME_ACU_CHARGE });
    }
  }

  // Refund on failure, minus a small non-refundable compute floor when the AI
  // actually ran — otherwise "always fail on purpose" farms free model calls.
  const COMPUTE_FLOOR = 50;
  const refund = async (aiRan: boolean) => {
    if (sql && walletId && balanceAfter !== null) {
      const back = aiRan ? FORGE_GAME_ACU_CHARGE - COMPUTE_FLOOR : FORGE_GAME_ACU_CHARGE;
      try { await creditWallet(sql, walletId, back); } catch { /* best-effort; reconciliation catches strays */ }
    }
  };

  try {
    // The AI DESIGNS the game (blueprint); the deterministic JOSHRIX engine RENDERS
    // it. This is the reliability fix: a one-shot AI HTML file can silently draw a
    // background and stop, but the engine is fixed, tested code that always renders.
    const bp = coerceBlueprint(blueprint, prompt, title, summary, language);
    const html = buildPlayableGame(bp);
    const provider = "engine";
    if (!html.includes("<canvas")) {
      await refund(false);
      return res.status(502).json({ error: "Engine build failed to produce a canvas — charge refunded." });
    }
    // Single-use forge id so a build that somehow fails to RENDER on the client can
    // auto-refund. Recorded only after a real charge, so a refund can't exceed the pay.
    let forgeId: string | undefined;
    if (sql && walletId && balanceAfter !== null) {
      forgeId = randomUUID();
      try { await recordForgeCharge(sql, forgeId, walletId, FORGE_GAME_ACU_CHARGE); } catch { forgeId = undefined; }
    }
    return res.status(200).json({ html, provider, acuCharge: FORGE_GAME_ACU_CHARGE, ...(forgeId ? { forgeId } : {}), ...(balanceAfter !== null ? { balanceAfter } : {}) });
  } catch (err: any) {
    await refund(false);
    return res.status(502).json({ error: "Game build failed", detail: String(err?.message ?? err) });
  }
}
// generateGameHtml is retained for a future validated AI-code path; the engine is
// the current reliable renderer. Reference it so the import is not flagged unused.
void generateGameHtml;
