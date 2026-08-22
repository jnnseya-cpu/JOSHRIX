/**
 * GET /api/growth-analytics?w=<walletId> — the creator's REAL campaign numbers.
 *
 * No AI, no estimates, no benchmarks: every figure here is counted from this
 * platform's own database. Where a number cannot be known (traffic source,
 * demographics, off-platform shares) it is listed under `notMeasured` rather
 * than filled in with a plausible-looking guess.
 */
import { getDb, ensureGameSchema, listGamesByWallet } from "./_ledger";
import { clientIp, rateLimit, tooMany } from "./_guard";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const walletId = String(req.query?.w ?? "");
  if (!walletId) return res.status(400).json({ error: "wallet required" });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Analytics unavailable — no database configured." });

  const rl = await rateLimit(sql, "analytics:" + clientIp(req), 120, 3600);
  if (!rl.ok) return tooMany(res, rl.retryAfter, "analytics requests");

  try {
    await ensureGameSchema(sql);
    const games = (await listGamesByWallet(sql, walletId, 200)) as any[];
    const approved = games.filter((g) => g.status === "approved");
    const pending = games.filter((g) => g.status === "pending_review");
    const totalPlays = approved.reduce((s, g) => s + Number(g.plays ?? 0), 0);

    const ranked = approved
      .map((g) => ({ id: g.id, title: g.title, plays: Number(g.plays ?? 0), published: g.created_at, url: `https://www.joshrix.com/play/${g.id}` }))
      .sort((a, b) => b.plays - a.plays);

    // days live is real; plays-per-day is arithmetic on real numbers, not a model
    const now = Date.now();
    const withRate = ranked.map((g) => {
      const days = Math.max(1, Math.round((now - new Date(g.published).getTime()) / 86400000));
      return { ...g, daysLive: days, playsPerDay: +(g.plays / days).toFixed(2) };
    });

    const zeroPlay = withRate.filter((g) => g.plays === 0);
    const median = withRate.length ? withRate[Math.floor(withRate.length / 2)].plays : 0;

    return res.status(200).json({
      wallet: walletId,
      summary: {
        gamesCreated: games.length,
        published: approved.length,
        awaitingReview: pending.length,
        totalPlays,
        averagePlaysPerPublishedGame: approved.length ? Math.round(totalPlays / approved.length) : 0,
        medianPlays: median,
        gamesWithNoPlaysYet: zeroPlay.length,
      },
      games: withRate.slice(0, 25),
      topPerformer: withRate[0] ?? null,
      needsAttention: zeroPlay.slice(0, 5).map((g) => ({ ...g, why: "Published but never played — it has not been shared anywhere yet." })),
      notMeasured: [
        "Traffic source (which link or platform sent each play) — not tracked yet.",
        "Player demographics — the platform never collects them.",
        "Off-platform shares, impressions and click-through — those live in each social platform's own analytics.",
        "Session length and completion rate — not instrumented in published games yet.",
      ],
      honesty: totalPlays === 0
        ? "No plays recorded yet. Every figure above is zero because nothing has been played — not because tracking failed."
        : "Every figure above is counted from this platform's database. Nothing is estimated or benchmarked.",
    });
  } catch (err: any) {
    return res.status(502).json({ error: "Analytics failed", detail: String(err?.message ?? err).slice(0, 200) });
  }
}
