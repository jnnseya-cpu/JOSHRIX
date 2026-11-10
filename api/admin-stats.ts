/**
 * GET /api/admin-stats — REAL platform counters for the admin command bridge.
 * Auth: x-admin-key must equal MODERATION_KEY (same trust as the review queue).
 * Returns actual database counts — no demo numbers, ever.
 *
 *   GET ?reference=a1b2c3d4  → the one failure a user quoted, and nothing else.
 *
 * That lookup is the reason correlation ids exist. A person says "it broke and
 * it said reference a1b2c3d4"; this turns that into the operation, the category
 * and the underlying message in one request, instead of guessing from
 * timestamps in a log.
 */
import { getDb, ensureGameSchema, adminStats, settledSummary, ensureSchema, ensureErrorSchema, failureSummary, failureByReference } from "./_ledger";
import { tooManyBadKeys } from "./_guard";
import { failing } from "./_observe";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const key = process.env.MODERATION_KEY;
  if (!key) return res.status(503).json({ error: "MODERATION_KEY not configured" });
  if (req.headers?.["x-admin-key"] !== key) {
    // count the failure before refusing, so the only credential on the
    // platform cannot be guessed at network speed
    if (await tooManyBadKeys(getDb(), req, res)) return;
    return res.status(401).json({ error: "Invalid admin key" });
  }

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "DATABASE_URL missing", mode: "no_db" });

  try {
    await ensureErrorSchema(sql);

    /* THE REFERENCE LOOKUP. Validated as an opaque token rather than trusted:
       it is read straight off a user's screen and goes into a query. */
    const reference = String(req.query?.reference ?? "").trim();
    if (reference) {
      if (!/^[0-9a-f]{8}$/.test(reference)) {
        return res.status(400).json({ error: "A failure reference is 8 hexadecimal characters, as shown to the user." });
      }
      const rows = await failureByReference(sql, reference);
      return res.status(200).json({
        reference,
        found: rows.length,
        failures: rows.map((r: any) => ({ operation: r.operation, category: r.category, message: r.message, at: r.created_at })),
        note: rows.length ? undefined : "No failure by that reference in the last 30 days.",
      });
    }

    await ensureGameSchema(sql);
    await ensureSchema(sql);
    const games = await adminStats(sql);
    const money = await settledSummary(sql);
    /* Failures ride along with the counters so the admin bridge shows what is
       breaking without a second request. 24h because that is the window the
       nightly review also uses — two numbers that disagree would be worse than
       one. */
    const failures = await failureSummary(sql, 24);
    return res.status(200).json({
      games, money,
      failures: {
        windowHours: 24,
        total: failures.reduce((a, r) => a + r.n, 0),
        groups: failures.map((r) => ({
          operation: r.operation, category: r.category, count: r.n,
          latestReference: r.latest_reference, latestMessage: String(r.latest_message).slice(0, 200), lastSeen: r.last_seen,
        })),
      },
    });
  } catch (err: any) {
    return failing(res, "admin.stats", err, "Stats failed");
  }
}
