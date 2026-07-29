/**
 * /api/moderation — Build 3: the human review gate before any game goes public.
 * Auth: request header `x-admin-key` must equal the MODERATION_KEY env var.
 *   GET               → list of pending_review games (metadata only, no html)
 *   POST { id, action: "approve"|"reject", note? } → sets the game's status
 * Without MODERATION_KEY set the endpoint refuses everything (fail closed).
 */
import { getDb, ensureGameSchema, listPendingGames, setGameStatus, getGame } from "./_ledger";
import { notify } from "./_notify";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.MODERATION_KEY;
  if (!key) return res.status(503).json({ error: "Moderation not configured (MODERATION_KEY missing) — review queue is locked." });
  if (req.headers?.["x-admin-key"] !== key) return res.status(401).json({ error: "Invalid moderation key" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "DATABASE_URL missing — no games are stored yet.", mode: "no_db" });

  try {
    await ensureGameSchema(sql);

    if (req.method === "GET") {
      const pending = await listPendingGames(sql);
      return res.status(200).json({ pending, count: pending.length });
    }

    if (req.method === "POST") {
      const { id, action, note } = (req.body ?? {}) as Record<string, string>;
      if (!id || (action !== "approve" && action !== "reject")) {
        return res.status(400).json({ error: "Body must include `id` and `action` of approve|reject." });
      }
      const status = action === "approve" ? "approved" as const : "rejected" as const;
      const found = await setGameStatus(sql, id, status, note ?? null);
      if (!found) return res.status(404).json({ error: "Game not found" });
      // tell the creator — approval also announces the live public link
      const g = await getGame(sql, id);
      const creatorEmail = g?.creator_email ?? null;
      const vars = { game: g?.title ?? id, url: `https://www.joshrix.com/play/${id}` };
      await notify(status === "approved" ? "game.approved" : "game.rejected", creatorEmail, vars);
      if (status === "approved") await notify("game.link_live", creatorEmail, vars);
      return res.status(200).json({ id, status, note: note ?? null });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (err: any) {
    return res.status(502).json({ error: "Moderation action failed", detail: String(err?.message ?? err) });
  }
}
