/**
 * POST /api/forge-game — the Code Agent forges a REAL playable game.
 * Body: { prompt, title?, summary?, language?, walletId? }
 * Returns: { html, provider, acuCharge, balanceAfter? } — a complete self-contained
 * HTML5 game implementing the creator's concept. Long-running: see vercel.json.
 * Build 2 (server-side ACU enforcement): with DATABASE_URL configured the 300-ACU
 * forge charge is debited server-side BEFORE generation and refunded on failure.
 */
import { generateGameHtml, FORGE_GAME_ACU_CHARGE } from "./_gateway";
import { getDb, ensureGameSchema, debitWallet, creditWallet } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { prompt, title, summary, language, walletId } = (req.body ?? {}) as Record<string, string>;
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
    const { html, provider } = await generateGameHtml(prompt, { title, summary, language });
    if (!html.includes("<canvas")) {
      await refund(true);
      return res.status(502).json({ error: "Code Agent produced no playable canvas — please forge again (charge refunded minus a small compute floor)." });
    }
    return res.status(200).json({ html, provider, acuCharge: FORGE_GAME_ACU_CHARGE, ...(balanceAfter !== null ? { balanceAfter } : {}) });
  } catch (err: any) {
    await refund(false);
    return res.status(502).json({ error: "Game generation failed", detail: String(err?.message ?? err) });
  }
}
