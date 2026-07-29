/**
 * POST /api/blueprint — Idea Agent endpoint.
 * Body: { prompt: string, type?, platform?, scope?, language?, walletId? }
 * Returns: { blueprint, provider, acuCharge, balanceAfter? }
 * Build 2 (server-side ACU enforcement): when DATABASE_URL is configured the
 * charge is debited from the server wallet BEFORE generation (No-Free-AI rule)
 * and refunded automatically if generation fails. 402 = not enough ACUs.
 */
import { generateBlueprint, BLUEPRINT_ACU_CHARGE } from "./_gateway";
import { getDb, ensureGameSchema, debitWallet, creditWallet } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { prompt, type, platform, scope, language, walletId } = (req.body ?? {}) as Record<string, string>;
  if (!prompt || typeof prompt !== "string" || prompt.length < 4) {
    return res.status(400).json({ error: "Body must include a game description in `prompt`." });
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
      balanceAfter = await debitWallet(sql, walletId, BLUEPRINT_ACU_CHARGE);
    } catch (err: any) {
      return res.status(502).json({ error: "Wallet check failed", detail: String(err?.message ?? err) });
    }
    if (balanceAfter === null) {
      return res.status(402).json({ error: `Not enough ACUs (blueprint costs ${BLUEPRINT_ACU_CHARGE}). Top up at /wallet.html.`, acuCharge: BLUEPRINT_ACU_CHARGE });
    }
  }

  try {
    const { blueprint, provider } = await generateBlueprint(prompt, { type, platform, scope, language });
    return res.status(200).json({ blueprint, provider, acuCharge: BLUEPRINT_ACU_CHARGE, ...(balanceAfter !== null ? { balanceAfter } : {}) });
  } catch (err: any) {
    if (sql && walletId && balanceAfter !== null) {
      // generation failed AFTER the debit — put the ACUs back
      try { await creditWallet(sql, walletId, BLUEPRINT_ACU_CHARGE); } catch { /* refund best-effort; ledger reconciliation catches strays */ }
    }
    return res.status(502).json({ error: "Blueprint generation failed", detail: String(err?.message ?? err) });
  }
}
