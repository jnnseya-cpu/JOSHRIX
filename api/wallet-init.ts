/**
 * POST /api/wallet-init — server-side wallet bootstrap (Build 2: real ACU enforcement).
 * Body: { walletId?, email?, name?, action? }
 *  - no walletId          → creates a fresh GATED wallet with ZERO ACUs. Public
 *                           signup buys its own credit — see WALLET_CATEGORIES.
 *  - walletId             → returns that wallet's live balance (+refreshes identity)
 *  - action: "refill"     → TESTER wallets only, and a tester is designated by an
 *                           admin holding MODERATION_KEY. Tops up to the tester
 *                           ceiling, never lowers a balance, cooldown-limited, and
 *                           locked out forever once the wallet has purchased.
 *  - action: "delete"     → any account that has not purchased; purchased accounts
 *                           contact support (refund flow first — see refunds policy)
 * Without DATABASE_URL responds { mode: "no_db" } so the client keeps its local sim.
 */
import { randomUUID } from "node:crypto";
import { getDb, ensureGameSchema, createWallet, getWallet, getWalletByEmail, refillTesterWallet, deleteWallet, updateWalletIdentity } from "./_ledger";
import { normalizeEmail, clientIp, rateLimit, tooMany, claimNonce, recordSecurityEvent } from "./_guard";
import { verifyHuman, isDisposableEmail, humanVerifyConfigured } from "./_human";
import { DEFAULT_WALLET_CATEGORY, TESTER_CEILING_ACU, TESTER_REFILL_COOLDOWN_SECONDS } from "../shared/payments";

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
      // Anyone who has not paid may close their own account. Only a PURCHASED
      // wallet routes through support, because deleting it would silently
      // forfeit a real balance that is owed a refund first.
      if (w.category === "purchased") {
        return res.status(403).json({ error: "Purchased accounts are closed via support (request any refund first — see the refund policy)." });
      }
      const gone = await deleteWallet(sql, walletId);
      return res.status(200).json({ mode: "live", deleted: gone, walletId });
    }

    if (action === "refill") {
      if (!walletId) return res.status(400).json({ error: "walletId required for refill" });
      const balance = await refillTesterWallet(sql, walletId, TESTER_CEILING_ACU, TESTER_REFILL_COOLDOWN_SECONDS);
      if (balance === null) {
        // Deliberately one message for every refusal — "you are not a tester",
        // "you are already at the ceiling" and "wait a moment" must not be
        // distinguishable, or the endpoint becomes a category oracle.
        return res.status(403).json({
          error: `Refill is for designated tester accounts, up to ${TESTER_CEILING_ACU.toLocaleString()} ACUs, at most once every ${TESTER_REFILL_COOLDOWN_SECONDS} seconds. Everyone else tops up at /wallet.`,
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

    // ONE WALLET PER PERSON. No signup is funded any more, so this is no longer a
    // free-credit control — it is an identity control: one address must map to one
    // wallet, or a creator's games, balance and purchase history scatter across
    // duplicates. normalizeEmail strips +tags and gmail dots so alice+1@,
    // alice+2@ and a.l.i.c.e@ all resolve to the same account.
    const raw = typeof email === "string" ? email.trim() : "";
    const addr = raw ? normalizeEmail(raw) : "";
    const validEmail = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(addr) && addr.length <= 254;
    if (!validEmail) {
      // anonymous caller: issue an empty wallet so browsing and the Studio UI
      // still work, and let a verified email claim it later
      const id0 = "w-" + randomUUID().replace(/-/g, "").slice(0, 20);
      await createWallet(sql, id0, 0, DEFAULT_WALLET_CATEGORY, null, name?.slice(0, 80) ?? null);
      return res.status(200).json({
        mode: "live", walletId: id0, balance: 0, category: DEFAULT_WALLET_CATEGORY, plan: "explorer", created: true,
        note: "Sign in with a verified email, then top up at /wallet to forge.",
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
    /* NEW ACCOUNT. It mints no credit — public wallets start at zero — so these
       checks are not protecting a grant. They protect the accounts table and the
       mailing list from being filled with addresses that cannot receive mail, and
       they run only here, on creation, never on a balance refresh. */
    if (isDisposableEmail(addr)) {
      await recordSecurityEvent(sql, "disposable_email_blocked", "warn", { ip: clientIp(req), email: addr });
      return res.status(403).json({
        error: "That looks like a temporary mailbox. Please use an address you can receive mail at — your games, wallet and receipts are tied to it.",
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
    await createWallet(sql, id, 0, DEFAULT_WALLET_CATEGORY, addr, name?.slice(0, 80) ?? null);
    return res.status(200).json({
      mode: "live", walletId: id, balance: 0, category: DEFAULT_WALLET_CATEGORY, plan: "explorer", created: true,
      note: "Top up at /wallet to forge your first game.",
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Wallet init failed", detail: String(err?.message ?? err) });
  }
}
