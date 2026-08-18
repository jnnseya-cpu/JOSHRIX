/**
 * POST /api/wallet-init — server-side wallet bootstrap (Build 2: real ACU enforcement).
 * Body: { walletId?, email?, name?, action? }
 *  - no walletId          → creates a fresh TESTER wallet funded with FREE_GRANT_ACU
 *  - walletId             → returns that wallet's live balance (+refreshes identity)
 *  - action: "refill"     → tester wallets only, hardened: only below FREE_REFILL_FLOOR,
 *                           max once per 6 hours, a LIFETIME cap of
 *                           FREE_REFILL_LIFETIME_MAX, never lowers a balance, and
 *                           never on a wallet that has ever purchased
 *  - action: "delete"     → tester wallets only; purchased accounts must contact
 *                           support (refund flow first — see refunds policy)
 * Without DATABASE_URL responds { mode: "no_db" } so the client keeps its local sim.
 */
import { randomUUID } from "node:crypto";
import { getDb, ensureGameSchema, createWallet, getWallet, getWalletByEmail, refillTesterWallet, refillState, deleteWallet, updateWalletIdentity } from "./_ledger";
import { normalizeEmail, clientIp, rateLimit, tooMany, claimNonce, recordSecurityEvent } from "./_guard";
import { verifyHuman, isDisposableEmail, humanVerifyConfigured } from "./_human";
import { FREE_GRANT_ACU, FREE_REFILL_FLOOR, FREE_REFILL_LIFETIME_MAX } from "../shared/payments";

/** Kept as a named re-export so existing callers and tests do not break, but the
 *  value now has ONE definition, next to the plans it has to stay consistent with. */
export const TESTER_GRANT_ACU = FREE_GRANT_ACU;

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const sql = getDb();
  if (!sql) return res.status(200).json({ mode: "no_db", note: "Set DATABASE_URL to enable server-side wallets." });

  // 20 wallet operations per IP per hour: enough for real use, far too few to
  // farm accounts or flood the wallets table
  const rl = await rateLimit(sql, "wallet-init:" + clientIp(req), 20, 3600);
  if (!rl.ok) return tooMany(res, rl.retryAfter, "wallet requests");

  const { walletId, email, name, action, human } = (req.body ?? {}) as Record<string, any>;

  try {
    await ensureGameSchema(sql);

    if (action === "delete") {
      if (!walletId) return res.status(400).json({ error: "walletId required for delete" });
      const w = await getWallet(sql, walletId);
      if (!w) return res.status(200).json({ mode: "live", deleted: false, walletId });
      if (w.category !== "tester") {
        return res.status(403).json({ error: "Purchased accounts are closed via support (request any refund first — see the refund policy)." });
      }
      const gone = await deleteWallet(sql, walletId);
      return res.status(200).json({ mode: "live", deleted: gone, walletId });
    }

    if (action === "refill") {
      if (!walletId) return res.status(400).json({ error: "walletId required for refill" });
      const balance = await refillTesterWallet(
        sql, walletId, FREE_GRANT_ACU, FREE_REFILL_FLOOR, FREE_REFILL_LIFETIME_MAX);
      if (balance === null) {
        // Say WHICH limit was hit. "Refused" with no reason reads as a bug, and
        // a creator who has simply exhausted the trial needs to be told that
        // plainly so they can decide to pay.
        const st = await refillState(sql, walletId);
        const why = !st ? "That wallet does not exist."
          : st.category !== "tester" ? "Refill is for free trial wallets only."
          : st.refill_count >= FREE_REFILL_LIFETIME_MAX
            ? `The free trial is finished — it includes ${FREE_REFILL_LIFETIME_MAX} refills and all of them have been used. Choose a plan or top up at /pricing.`
          : st.balance >= FREE_REFILL_FLOOR
            ? `Refill unlocks below ${FREE_REFILL_FLOOR.toLocaleString()} ACUs; this wallet still holds ${Number(st.balance).toLocaleString()}.`
          : "Refill is available at most once every 6 hours.";
        return res.status(403).json({
          error: why,
          refillsUsed: st?.refill_count ?? null,
          refillsAllowed: FREE_REFILL_LIFETIME_MAX,
        });
      }
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

    // FREE-AI CONTROL. Creating a wallet grants real, spendable AI credit, so the
    // grant is bound to an identity and issued once per address. Without this an
    // unauthenticated caller loops this endpoint and mints unlimited funded
    // wallets — every one of them spending real provider money.
    // normalizeEmail strips +tags and gmail dots: without it one mailbox mints
    // unlimited funded wallets via alice+1@, alice+2@, a.l.i.c.e@ ...
    const raw = typeof email === "string" ? email.trim() : "";
    const addr = raw ? normalizeEmail(raw) : "";
    const validEmail = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(addr) && addr.length <= 254;
    if (!validEmail) {
      // anonymous caller: issue an EMPTY wallet so the flow still works, but no
      // credit until a signed-in identity claims it
      const id0 = "w-" + randomUUID().replace(/-/g, "").slice(0, 20);
      await createWallet(sql, id0, 0, "tester", null, name?.slice(0, 80) ?? null);
      return res.status(200).json({
        mode: "live", walletId: id0, balance: 0, category: "tester", plan: "explorer", created: true,
        note: "Sign in with a verified email to claim your starter ACUs.",
      });
    }
    const existing = await getWalletByEmail(sql, addr);
    if (existing) {
      // this address already has its one grant — hand back the SAME wallet
      if (name) { try { await updateWalletIdentity(sql, existing.id, { name: name.slice(0, 80), email: addr }); } catch { /* best-effort */ } }
      return res.status(200).json({
        mode: "live", walletId: existing.id, balance: Number(existing.balance),
        category: existing.category, plan: existing.plan ?? "explorer", created: false,
      });
    }
    /* THE FUNDED GRANT. Everything above this line either returns an existing
       wallet or an empty one, and neither is worth automating. This is the only
       branch that mints real, spendable AI credit from nothing, so this is where
       the human check belongs — not on every balance refresh, which would charge
       ordinary users a second of CPU for no security gain. */
    if (isDisposableEmail(addr)) {
      await recordSecurityEvent(sql, "disposable_email_blocked", "warn", { ip: clientIp(req), email: addr });
      return res.status(403).json({
        error: "That looks like a temporary mailbox. Please use an address you can receive mail at — starter credits are one per person.",
      });
    }
    if (humanVerifyConfigured()) {
      const v = await verifyHuman((human ?? {}) as any, clientIp(req), (n) => claimNonce(sql, n));
      if (!v.ok) {
        await recordSecurityEvent(sql, "human_verification_failed", "block", {
          ip: clientIp(req), reason: v.reason, email: addr,
        });
        return res.status(403).json({
          error: "We could not verify this signup came from a person.",
          detail: v.reason,
          retry: "Reload the page and try again — the check runs automatically in your browser.",
        });
      }
    }

    const id = "w-" + randomUUID().replace(/-/g, "").slice(0, 20);
    await createWallet(sql, id, TESTER_GRANT_ACU, "tester", addr, name?.slice(0, 80) ?? null);
    return res.status(200).json({ mode: "live", walletId: id, balance: TESTER_GRANT_ACU, category: "tester", plan: "explorer", created: true });
  } catch (err: any) {
    return res.status(502).json({ error: "Wallet init failed", detail: String(err?.message ?? err) });
  }
}
