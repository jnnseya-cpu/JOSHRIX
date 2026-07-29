/**
 * GET /api/arcade — Lane 1: the JOSHRIX Arcade feed.
 * Every moderation-approved game, most-played first. This is the same feed the
 * Play Store / App Store "JOSHRIX Arcade" shell app will read — the web arcade
 * at /arcade is live from day one.
 */
import { getDb, ensureGameSchema, listApprovedGames } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const sql = getDb();
  if (!sql) return res.status(200).json({ games: [], mode: "no_db", note: "Arcade comes online when the database is connected." });

  try {
    await ensureGameSchema(sql);
    const games = (await listApprovedGames(sql)).map((g) => ({
      id: g.id,
      title: g.title,
      summary: g.summary,
      language: g.language,
      plays: Number(g.plays ?? 0),
      playUrl: `/play/${g.id}`,
    }));
    return res.status(200).json({ games, count: games.length });
  } catch (err: any) {
    return res.status(502).json({ error: "Arcade feed failed", detail: String(err?.message ?? err) });
  }
}
