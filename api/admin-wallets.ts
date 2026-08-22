/**
 * /api/admin-wallets — the admin's ACU grant desk.
 * Auth: x-admin-key must equal MODERATION_KEY (same credential as the bridge).
 *   GET                              → all wallets (id, balance, category, email)
 *   POST { walletId, amount }        → credit `amount` ACUs to that wallet
 *   POST { walletId, plan }          → move the account onto a subscription tier
 *   POST { walletId, category }      → designate a tester, or gate them again
 * Grants are admin-only top-ups for testers/goodwill — purchased balances still
 * only ever grow through verified Stripe settlement. Designating a tester is the
 * ONLY route to free AI credit on this platform; everyone else pays.
 */
import { getDb, ensureGameSchema, listWallets, creditWallet, getWallet, setWalletPlan, setWalletCategory, findWalletsByIdentity } from "./_ledger";
import { tooManyBadKeys } from "./_guard";
import { notify } from "./_notify";
import { PLANS, ASSIGNABLE_WALLET_CATEGORIES } from "../shared/payments";

const MAX_GRANT = 100_000;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.MODERATION_KEY;
  if (!key) return res.status(503).json({ error: "MODERATION_KEY not configured" });
  if (req.headers?.["x-admin-key"] !== key) {
    // count the failure before refusing, so the only credential on the
    // platform cannot be guessed at network speed
    if (await tooManyBadKeys(getDb(), req, res)) return;
    return res.status(401).json({ error: "Invalid admin key" });
  }

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "DATABASE_URL missing", mode: "no_db" });

  try {
    await ensureGameSchema(sql);

    if (req.method === "GET") {
      const wallets = (await listWallets(sql)).map((w) => ({
        id: w.id, balance: Number(w.balance), category: w.category, email: w.email, name: w.name ?? null, plan: w.plan ?? "explorer", createdAt: w.created_at,
      }));
      return res.status(200).json({ wallets, count: wallets.length });
    }

    if (req.method === "POST") {
      const { walletId, amount, plan, grantMonthlyAcu, category } = (req.body ?? {}) as { walletId?: string; amount?: number; plan?: string; grantMonthlyAcu?: boolean; category?: string };
      if (!walletId || typeof walletId !== "string") return res.status(400).json({ error: "walletId required" });

      // Admins know people, not IDs: accept a wallet ID, an email, or a name.
      // Exactly one human match resolves; several matches come back as a list
      // to choose from — a grant must never land on a guessed wallet.
      let target = await getWallet(sql, walletId);
      if (!target) {
        const matches = await findWalletsByIdentity(sql, walletId);
        if (matches.length === 1) target = matches[0];
        else if (matches.length > 1) {
          return res.status(409).json({
            error: `"${walletId}" matches ${matches.length} wallets — use the exact wallet ID`,
            matches: matches.map((m: any) => ({ id: m.id, name: m.name ?? null, email: m.email ?? null, balance: Number(m.balance) })),
          });
        }
      }
      if (!target) return res.status(404).json({ error: "No wallet found by that ID, email, or name — the tester's wallet ID is shown on their Wallet page." });
      const targetId = target.id;

      // DESIGNATE A TESTER. This is the only way a wallet becomes entitled to free
      // refills, which is what keeps "no free AI" true for everyone else. It moves
      // no money; it decides who is allowed to be funded without paying.
      if (category) {
        if (!(ASSIGNABLE_WALLET_CATEGORIES as readonly string[]).includes(category)) {
          return res.status(400).json({ error: `category must be one of: ${ASSIGNABLE_WALLET_CATEGORIES.join(", ")} — "purchased" is set by Stripe settlement, never by hand` });
        }
        const now = await setWalletCategory(sql, targetId, category);
        if (now === null) {
          return res.status(409).json({ error: "This wallet has purchased ACUs. A paid account cannot be reclassified — that would hand it free refills." });
        }
        return res.status(200).json({ ok: true, walletId: targetId, category: now, balance: Number(target.balance) });
      }

      // plan change: put the account on a subscription tier, optionally granting
      // that plan's monthly ACUs immediately (admin decision, e.g. comped accounts)
      if (plan) {
        const p = PLANS.find((x) => x.id === plan);
        if (!p) return res.status(400).json({ error: `plan must be one of: ${PLANS.map((x) => x.id).join(", ")}` });
        await setWalletPlan(sql, targetId, p.id);
        let balance = Number(target.balance);
        if (grantMonthlyAcu && p.monthlyAcu > 0) balance = (await creditWallet(sql, targetId, p.monthlyAcu)) ?? balance;
        await notify("subscription.activated", target.email ?? null, { plan: p.name });
        return res.status(200).json({ ok: true, walletId: targetId, plan: p.id, planName: p.name, monthlyAcuGranted: grantMonthlyAcu ? p.monthlyAcu : 0, balance });
      }

      const amt = Number(amount);
      if (!Number.isInteger(amt) || amt < 1 || amt > MAX_GRANT) {
        return res.status(400).json({ error: `amount must be a whole number of ACUs between 1 and ${MAX_GRANT.toLocaleString()}` });
      }
      const balance = await creditWallet(sql, targetId, amt);
      await notify("acu.granted", target.email ?? null, { amount: amt.toLocaleString() });
      return res.status(200).json({ ok: true, walletId: targetId, granted: amt, balance, matchedEmail: target.email ?? null, matchedName: (target as any).name ?? null });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (err: any) {
    return res.status(502).json({ error: "Wallet admin action failed", detail: String(err?.message ?? err) });
  }
}
