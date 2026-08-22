/**
 * GET /api/my-games?walletId=<id> — the creator's own games for the dashboard.
 * Returns real status (pending_review / approved / rejected), real play counts,
 * and each game's play + preview links. Empty list when they haven't forged yet.
 */
import { getDb, ensureGameSchema, listGamesByWallet } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  // POST only: wallet ids are bearer secrets and must never ride query strings
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const walletId = String((req.body ?? {}).walletId ?? "");
  if (!/^w-[a-z0-9]{6,40}$/.test(walletId)) return res.status(400).json({ error: "Invalid walletId" });

  const sql = getDb();
  if (!sql) return res.status(200).json({ games: [], mode: "no_db" });

  try {
    await ensureGameSchema(sql);
    const games = (await listGamesByWallet(sql, walletId)).map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      plays: Number(g.plays ?? 0),
      createdAt: g.created_at,
      playUrl: `/play/${g.id}`,
      previewUrl: `/play/${g.id}?preview=1`,
      // marketplace state, so the creator can see and change their own price
      priceMinor: g.price_minor == null ? null : Number(g.price_minor),
      sellerPlan: g.seller_plan ?? null,
    }));
    const totalPlays = games.reduce((s, g) => s + g.plays, 0);
    return res.status(200).json({ games, count: games.length, totalPlays });
  } catch (err: any) {
    return res.status(502).json({ error: "Could not load your games", detail: String(err?.message ?? err) });
  }
}
