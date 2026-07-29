/**
 * POST /api/distribution — Lanes 2 & 3: join the store-distribution queue.
 * Body: { lane: "dedicated"|"own", store: "android"|"ios"|"both",
 *         mode?: "export"|"connected", gameId?, email?, walletId? }
 *  lane "dedicated" → own store listing under the JOSHRIX publisher account
 *                     (Android broadly; iOS curated — see docs/COMPETITIVE.md)
 *  lane "own"       → creator's own developer account: "export" hands over a
 *                     store-ready build + listing pack; "connected" links their
 *                     store console for one-click publishing from the dashboard
 * Requests land in dist_requests with status "queued"; the team drives each
 * through PACKAGING → SUBMITTED → IN STORE REVIEW → LIVE / NEEDS CHANGES.
 */
import { getDb, ensureGameSchema, getGame, saveDistRequest } from "./_ledger";
import { EMAIL_RE } from "./_guard";

const LANES = ["dedicated", "own"];
const STORES = ["android", "ios", "both"];
const MODES = ["export", "connected"];

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { lane, store, mode, gameId, email, walletId } = (req.body ?? {}) as Record<string, string>;
  if (!LANES.includes(lane)) return res.status(400).json({ error: "lane must be dedicated|own" });
  if (!STORES.includes(store)) return res.status(400).json({ error: "store must be android|ios|both" });
  if (lane === "own" && mode && !MODES.includes(mode)) return res.status(400).json({ error: "mode must be export|connected" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Distribution queue activates when the database is connected.", mode: "no_db" });

  try {
    await ensureGameSchema(sql);
    if (gameId) {
      const g = await getGame(sql, gameId);
      if (!g) return res.status(404).json({ error: "Game not found — publish it first (Approve & Publish in the Studio)." });
      // only the game's creator can request distribution for it
      if (g.creator_wallet && g.creator_wallet !== walletId) {
        return res.status(403).json({ error: "Only the game's creator can request store distribution for it." });
      }
    }
    const safeEmail = email && EMAIL_RE.test(email) ? email : null;
    const id = await saveDistRequest(sql, { gameId: gameId ?? null, lane, store, mode: mode ?? null, email: safeEmail, walletId: walletId ?? null });
    return res.status(200).json({
      ok: true,
      ref: `DIST-${id}`,
      status: "queued",
      pipeline: ["QUEUED", "PACKAGING", "SUBMITTED", "IN STORE REVIEW", "LIVE"],
      note: lane === "dedicated"
        ? "Queued for the JOSHRIX publisher pipeline — we package, file the store paperwork, and submit. Store review typically takes 1–7 days; iOS slots are curated."
        : mode === "connected"
          ? "Queued for connected publishing — we'll walk you through granting limited API access to your developer console; after that, publishing is one click from your dashboard."
          : "Queued for export — you'll receive a signed, store-ready build plus the completed listing pack to upload to your own developer console.",
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Could not queue distribution request", detail: String(err?.message ?? err) });
  }
}
