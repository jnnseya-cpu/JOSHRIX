/**
 * GET /api/game-html?id=<gameId>[&preview=1] — serves a hosted game to /play/<id>.
 * Rules (Build 3 moderation gate):
 *   approved        → metadata + html, play count bumped
 *   pending_review  → html ONLY with ?preview=1 (creator playtest link); public
 *                     visitors see the status so shared links don't 404 pre-approval
 *   rejected        → status + review note, never the html
 */
import { getDb, ensureGameSchema, getGame, bumpPlays } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Game hosting is not configured yet (DATABASE_URL missing).", mode: "no_db" });

  const id = String(req.query?.id ?? "");
  if (!/^g-[a-z0-9-]{3,80}$/.test(id)) return res.status(400).json({ error: "Invalid game id" });
  const preview = String(req.query?.preview ?? "") === "1";

  try {
    await ensureGameSchema(sql);
    const game = await getGame(sql, id, true);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const meta = {
      id: game.id,
      title: game.title,
      summary: game.summary,
      language: game.language,
      status: game.status,
      plays: Number(game.plays ?? 0),
      createdAt: game.created_at,
    };

    if (game.status === "approved") {
      await bumpPlays(sql, id);
      return res.status(200).json({ ...meta, plays: meta.plays + 1, html: game.html });
    }
    if (game.status === "pending_review" && preview) {
      return res.status(200).json({ ...meta, html: game.html, note: "Creator preview — public once approved." });
    }
    if (game.status === "pending_review") {
      return res.status(200).json({ ...meta, note: "This game is in moderation review and will be playable once approved." });
    }
    return res.status(200).json({ ...meta, note: "This game was not approved for public play." });
  } catch (err: any) {
    return res.status(502).json({ error: "Could not load game", detail: String(err?.message ?? err) });
  }
}
