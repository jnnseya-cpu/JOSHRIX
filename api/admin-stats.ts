/**
 * GET /api/admin-stats — REAL platform counters for the admin command bridge.
 * Auth: x-admin-key must equal MODERATION_KEY (same trust as the review queue).
 * Returns actual database counts — no demo numbers, ever.
 */
import { getDb, ensureGameSchema, adminStats, settledSummary, ensureSchema } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const key = process.env.MODERATION_KEY;
  if (!key) return res.status(503).json({ error: "MODERATION_KEY not configured" });
  if (req.headers?.["x-admin-key"] !== key) return res.status(401).json({ error: "Invalid admin key" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "DATABASE_URL missing", mode: "no_db" });

  try {
    await ensureGameSchema(sql);
    await ensureSchema(sql);
    const games = await adminStats(sql);
    const money = await settledSummary(sql);
    return res.status(200).json({ games, money });
  } catch (err: any) {
    return res.status(502).json({ error: "Stats failed", detail: String(err?.message ?? err) });
  }
}
