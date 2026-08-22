/**
 * POST /api/blueprint — Idea Agent endpoint.
 * Body: { prompt: string, type?, platform?, scope?, language?, walletId? }
 * Returns: { blueprint, provider, acuCharge, balanceAfter? }
 * Build 2 (server-side ACU enforcement): when DATABASE_URL is configured the
 * charge is debited from the server wallet BEFORE generation (No-Free-AI rule)
 * and refunded automatically if generation fails. 402 = not enough ACUs.
 */
import { generateBlueprint, acuChargeForUsage, BLUEPRINT_ACU_CHARGE, BLUEPRINT_MIN_CHARGE } from "./_gateway";
import { clientIp, rateLimit, tooMany, forgeDisabled } from "./_guard";
import { getDb, ensureGameSchema, debitWallet, creditWallet } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const _paused = forgeDisabled();
  if (_paused) return res.status(503).json({ error: _paused });

  const _sql = getDb();
  if (_sql) {
    const _rl = await rateLimit(_sql, "blueprint:" + clientIp(req), 40, 3600);
    if (!_rl.ok) return tooMany(res, _rl.retryAfter, "blueprint requests");
  }

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
    const { blueprint, provider, usage } = await generateBlueprint(prompt, { type, platform, scope, language });
    // METERED SETTLEMENT — the upfront debit was a hold; the real charge is 4x the
    // metered AI cost of THIS run (floor BLUEPRINT_MIN_CHARGE). Unused hold refunds.
    let settled = BLUEPRINT_ACU_CHARGE;
    if (provider === "claude" && usage) {
      settled = Math.max(BLUEPRINT_MIN_CHARGE, acuChargeForUsage("claude-opus-5", usage));
      if (sql && walletId && balanceAfter !== null && settled !== BLUEPRINT_ACU_CHARGE) {
        try {
          if (settled < BLUEPRINT_ACU_CHARGE) {
            const nb = await creditWallet(sql, walletId, BLUEPRINT_ACU_CHARGE - settled);
            if (nb !== null) balanceAfter = nb;
          } else {
            const nb = await debitWallet(sql, walletId, settled - BLUEPRINT_ACU_CHARGE);
            if (nb !== null) balanceAfter = nb;
          }
        } catch { /* settlement best-effort */ }
      }
    }
    return res.status(200).json({ blueprint, provider, acuCharge: settled, ...(balanceAfter !== null ? { balanceAfter } : {}) });
  } catch (err: any) {
    if (sql && walletId && balanceAfter !== null) {
      // generation failed AFTER the debit — put the ACUs back
      try { await creditWallet(sql, walletId, BLUEPRINT_ACU_CHARGE); } catch { /* refund best-effort; ledger reconciliation catches strays */ }
    }
    return res.status(502).json({ error: "Blueprint generation failed", detail: String(err?.message ?? err) });
  }
}
