/**
 * GET /api/wallet — the signed-in creator's real wallet.
 *
 * WHAT THIS USED TO RETURN: invented numbers. 1,873 ACUs, £482 available
 * earnings, £964 lifetime, and three fabricated ledger rows including a sale of
 * a game called "Penalty King" that has never existed. None of it came from the
 * database; all of it was hard-coded, and it answered every caller identically.
 *
 * A screen of invented money is not a feature. Nothing on the site happened to
 * render it — /api/wallet-init serves the pages — so it sat there as an
 * endpoint that would tell anyone who asked that they had £482 waiting.
 *
 * Now it reads the ledger, for the caller who proved who they are. Everything
 * below is a real figure or is absent.
 */
import { PAYOUT, EARNINGS_CLEARING_DAYS } from "../shared/payments";
import { getDb, ensureGameSchema, ensurePayoutSchema, getWallet, getEarnings, releaseExpiredForgeHolds, listGamesByWallet } from "./_ledger";
import { callerIdentity } from "./_auth";
import { walletOwnerUid } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "The ledger is not reachable.", mode: "no_db" });

  const walletId = String(req.query?.walletId ?? "");
  if (!/^w-[a-z0-9]{6,40}$/.test(walletId)) return res.status(400).json({ error: "walletId required" });

  try {
    await ensureGameSchema(sql);
    await ensurePayoutSchema(sql);

    // A wallet's balance and earnings are private. Once a wallet is bound to a
    // sign-in, only that sign-in reads it; an unbound wallet predates identity
    // and possession of the id is the only evidence that exists for it.
    const ownerUid = await walletOwnerUid(sql, walletId);
    if (ownerUid) {
      const caller = await callerIdentity(req);
      if (!caller || caller.uid !== ownerUid) {
        return res.status(401).json({ error: "Sign in to see this wallet.", code: "auth_required" });
      }
    }

    const wallet = await getWallet(sql, walletId);
    if (!wallet) return res.status(404).json({ error: "No such wallet." });

    // Hand back any forge hold left undecided past its window before reporting a
    // balance, so the figure shown is the figure that can actually be spent.
    try { await releaseExpiredForgeHolds(sql, walletId); } catch { /* reporting must survive the sweep */ }
    const fresh = await getWallet(sql, walletId);

    // getEarnings matures anything past the clearing window as it reads.
    const earn = await getEarnings(sql, walletId);
    const games = await listGamesByWallet(sql, walletId, 50);
    const listed = games.filter((g: any) => g.price_minor != null && Number(g.price_minor) > 0);

    return res.status(200).json({
      mode: "live",
      currency: "GBP",
      walletId,
      acu: Number(fresh?.balance ?? 0),
      category: fresh?.category ?? "standard",
      plan: (fresh as any)?.plan ?? "explorer",
      earnings: {
        availableMinor: Number(earn.available_minor ?? 0),
        clearingMinor: Number(earn.clearing_minor ?? 0),
        reservedMinor: Number(earn.reserved_minor ?? 0),
        paidMinor: Number(earn.paid_minor ?? 0),
      },
      games: { published: games.length, listed: listed.length, plays: games.reduce((n: number, g: any) => n + Number(g.plays ?? 0), 0) },
      payout: {
        minMinor: PAYOUT.minMinor,
        kycThresholdMinor: PAYOUT.kycThresholdMinor,
        clearingDays: EARNINGS_CLEARING_DAYS,
      },
      note: Number(earn.clearing_minor ?? 0) > 0
        ? `£${(Number(earn.clearing_minor) / 100).toFixed(2)} is still clearing and becomes withdrawable ${EARNINGS_CLEARING_DAYS} days after each sale.`
        : undefined,
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Could not read the wallet", detail: String(err?.message ?? err).slice(0, 200) });
  }
}
