/**
 * POST /api/wallet-init — server-side wallet bootstrap (Build 2: real ACU enforcement).
 * Body: { walletId?, email?, action? }
 *  - no walletId          → creates a fresh TESTER wallet funded with 2,000 ACUs
 *  - walletId             → returns that wallet's live balance
 *  - action: "refill"     → resets a TESTER wallet back to 2,000 ACUs (testers only;
 *                           purchased wallets only ever move via the Stripe webhook)
 * Without DATABASE_URL responds { mode: "no_db" } so the client keeps its local sim.
 */
import { randomUUID } from "node:crypto";
import { getDb, ensureGameSchema, createWallet, getWallet, refillTesterWallet, deleteWallet, updateWalletIdentity } from "./_ledger";

export const TESTER_GRANT_ACU = 2000;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const sql = getDb();
  if (!sql) return res.status(200).json({ mode: "no_db", note: "Set DATABASE_URL to enable server-side wallets." });

  const { walletId, email, name, action } = (req.body ?? {}) as Record<string, string>;
  try {
    await ensureGameSchema(sql);

    if (action === "delete") {
      // Account deletion: removes the server wallet (balance included). Published
      // games remain hosted; moderation can unpublish them on request.
      if (!walletId) return res.status(400).json({ error: "walletId required for delete" });
      const gone = await deleteWallet(sql, walletId);
      return res.status(200).json({ mode: "live", deleted: gone, walletId });
    }

    if (action === "refill") {
      if (!walletId) return res.status(400).json({ error: "walletId required for refill" });
      const balance = await refillTesterWallet(sql, walletId, TESTER_GRANT_ACU);
      if (balance === null) return res.status(403).json({ error: "Refill is for tester wallets only." });
      return res.status(200).json({ mode: "live", walletId, balance, category: "tester", refilled: true });
    }

    if (walletId) {
      const w = await getWallet(sql, walletId);
      if (w) {
        if (name || email) await updateWalletIdentity(sql, walletId, { name: name?.slice(0, 80) ?? null, email: email ?? null });
        return res.status(200).json({ mode: "live", walletId: w.id, balance: Number(w.balance), category: w.category, plan: (w as any).plan ?? "explorer" });
      }
      // Unknown id (e.g. DB was reset) — fall through and mint a fresh one.
    }

    const id = "w-" + randomUUID().replace(/-/g, "").slice(0, 20);
    await createWallet(sql, id, TESTER_GRANT_ACU, "tester", email ?? null, name?.slice(0, 80) ?? null);
    return res.status(200).json({ mode: "live", walletId: id, balance: TESTER_GRANT_ACU, category: "tester", plan: "explorer", created: true });
  } catch (err: any) {
    return res.status(502).json({ error: "Wallet init failed", detail: String(err?.message ?? err) });
  }
}
