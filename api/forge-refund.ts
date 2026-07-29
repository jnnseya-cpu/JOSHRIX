/**
 * POST /api/forge-refund — refund a forge that generated but failed to RENDER.
 * Body: { walletId, forgeId }
 * The Studio playtest calls this when its render watchdog reports the build drew
 * nothing (zero-size canvas, no canvas, or an uncaught error). The charge id is
 * single-use and tied to the paying wallet, and is only ever issued after a real
 * 300-ACU debit — so a refund can never exceed what was paid and cannot be farmed.
 */
import { getDb, ensureGameSchema, claimForgeRefund, creditWallet, getWallet } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { walletId, forgeId } = (req.body ?? {}) as Record<string, string>;
  if (!walletId || !forgeId) return res.status(400).json({ error: "walletId and forgeId required" });

  const sql = getDb();
  if (!sql) return res.status(200).json({ refunded: false, reason: "no ledger" });

  try {
    await ensureGameSchema(sql);
    const amount = await claimForgeRefund(sql, forgeId, walletId);
    if (amount === null) {
      // unknown id, wrong wallet, or already refunded — return current balance, no double credit
      const w = await getWallet(sql, walletId);
      return res.status(200).json({ refunded: false, ...(w ? { balanceAfter: Number(w.balance) } : {}) });
    }
    const balanceAfter = await creditWallet(sql, walletId, amount);
    return res.status(200).json({ refunded: true, amount, ...(balanceAfter !== null ? { balanceAfter } : {}) });
  } catch (err: any) {
    return res.status(502).json({ error: "Refund failed", detail: String(err?.message ?? err) });
  }
}
