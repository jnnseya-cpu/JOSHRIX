/**
 * POST /api/telemetry — Forge Graph collector.
 * Body: { events: TelemetryEvent[] } (max 500 per batch).
 *
 * WHAT THIS USED TO DO: validate the batch, answer `{ mode: "demo" }`, and
 * throw every event away. Meanwhile play.html, studio.html and embed.js all
 * posted to it faithfully, and shared/telemetry.ts opened with "the moat only
 * accrues if collection starts with the first user". Collection had never
 * started. Nothing was ever written.
 *
 * It now writes to Postgres. The endpoint is unauthenticated by necessity — a
 * play session has no wallet — so it is rate limited per IP, and the schema
 * enum is the allowlist: an event name that is not in ForgeGraphEvents cannot
 * be stored, which is what stops it becoming a free write-anything table.
 */
import { TelemetryBatchSchema } from "../shared/telemetry";
import { getDb, ensureTelemetrySchema, recordTelemetry } from "./_ledger";
import { clientIp, rateLimit, tooMany } from "./_guard";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const parsed = TelemetryBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid telemetry batch", issues: parsed.error.issues.slice(0, 5) });
  }

  const sql = getDb();
  if (!sql) {
    // No ledger: say so honestly rather than reporting a count that means
    // nothing. This is the one case where "accepted" would be a lie.
    return res.status(503).json({ accepted: 0, stored: false, error: "No telemetry store configured." });
  }

  try {
    // 120 batches an hour per IP. A real session sends a handful; this only
    // bites on a loop or a flood, and telemetry must never be a way to fill
    // the database.
    const rl = await rateLimit(sql, "telemetry:" + clientIp(req), 120, 3600);
    if (!rl.ok) return tooMany(res, rl.retryAfter, "telemetry batches");

    await ensureTelemetrySchema(sql);
    // Mapped explicitly rather than passed straight through: the ledger takes a
    // plain shape, so the storage layer never depends on the zod inference and
    // a schema change here cannot silently alter what gets written.
    const written = await recordTelemetry(sql, parsed.data.events.map((e) => ({
      event: e.event,
      sessionId: e.sessionId,
      ts: e.ts,
      gameId: e.gameId,
      language: e.language,
      props: e.props,
    })));
    return res.status(200).json({ accepted: parsed.data.events.length, stored: written });
  } catch (err: any) {
    // Telemetry failing must never break the page that sent it, so this is a
    // 200 with stored:false rather than an error the client has to handle.
    console.error(JSON.stringify({ telemetryError: String(err?.message ?? err) }));
    return res.status(200).json({ accepted: parsed.data.events.length, stored: 0 });
  }
}
