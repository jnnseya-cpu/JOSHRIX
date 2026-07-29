/**
 * /api/admin-wallets — the admin's ACU grant desk.
 * Auth: x-admin-key must equal MODERATION_KEY (same credential as the bridge).
 *   GET                              → all wallets (id, balance, category, email)
 *   POST { walletId, amount }        → credit `amount` ACUs to that wallet
 * Grants are admin-only top-ups for testers/goodwill — purchased balances still
 * only ever grow through verified Stripe settlement.
 */
import { getDb, ensureGameSchema, listWallets, creditWallet, getWallet } from "./_ledger";

const MAX_GRANT = 100_000;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.MODERATION_KEY;
  if (!key) return res.status(503).json({ error: "MODERATION_KEY not configured" });
  if (req.headers?.["x-admin-key"] !== key) return res.status(401).json({ error: "Invalid admin key" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "DATABASE_URL missing", mode: "no_db" });

  try {
    await ensureGameSchema(sql);

    if (req.method === "GET") {
      const wallets = (await listWallets(sql)).map((w) => ({
        id: w.id, balance: Number(w.balance), category: w.category, email: w.email, createdAt: w.created_at,
      }));
      return res.status(200).json({ wallets, count: wallets.length });
    }

    if (req.method === "POST") {
      const { walletId, amount } = (req.body ?? {}) as { walletId?: string; amount?: number };
      const amt = Number(amount);
      if (!walletId || typeof walletId !== "string") return res.status(400).json({ error: "walletId required" });
      if (!Number.isInteger(amt) || amt < 1 || amt > MAX_GRANT) {
        return res.status(400).json({ error: `amount must be a whole number of ACUs between 1 and ${MAX_GRANT.toLocaleString()}` });
      }
      const exists = await getWallet(sql, walletId);
      if (!exists) return res.status(404).json({ error: "Wallet not found — ask the tester for the wallet ID shown on their Wallet page." });
      const balance = await creditWallet(sql, walletId, amt);
      return res.status(200).json({ ok: true, walletId, granted: amt, balance });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (err: any) {
    return res.status(502).json({ error: "Wallet admin action failed", detail: String(err?.message ?? err) });
  }
}
