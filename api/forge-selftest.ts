/**
 * GET /api/forge-selftest
 * The diagnostic that the tiny "say OK" probe can't be: every configured AI
 * provider writes a COMPLETE real game at live forge size, in parallel, and the
 * response reports exactly what each returned — size, canvas, tokens, duration —
 * or the exact error it died with (deadline abort, truncation, HTTP failure).
 * This answers "why do full-size forges fail when the health probe passes"
 * from one URL, with no Studio session and no browser-cache dependency.
 *
 * Cost control: a fresh run makes three full-size generations (real provider
 * spend), so unauthenticated calls are served from a 10-minute cache; the
 * admin key (?key= or x-admin-key) forces a fresh run.
 */
import { fullSizeProbe, BUILD_ID } from "./_gateway";
import { getDb, ensureGameSchema, saveForgeResult, getForgeResult } from "./_ledger";

const CACHE_TICKET = "forge-selftest-cache";
const CACHE_MS = 600_000;

export default async function handler(req: any, res: any) {
  const key = (req.headers["x-admin-key"] as string) || (req.query?.key as string) || "";
  const isAdmin = !!process.env.MODERATION_KEY && key === process.env.MODERATION_KEY;

  const sql = getDb();
  if (!isAdmin && sql) {
    try {
      await ensureGameSchema(sql);
      const row = await getForgeResult(sql, CACHE_TICKET);
      if (row) {
        const cached = JSON.parse(row.payload);
        if (cached && cached.at && Date.now() - cached.at < CACHE_MS) {
          return res.status(200).json({ ...cached.body, cached: true, ageSeconds: Math.round((Date.now() - cached.at) / 1000) });
        }
      }
    } catch { /* run live */ }
  }

  const t0 = Date.now();
  const providers = await fullSizeProbe();
  const healthy = Object.values(providers).filter((p: any) => p.ok).length;
  const body = { build: BUILD_ID, healthy, of: 3, totalMs: Date.now() - t0, providers };
  if (sql) { try { await ensureGameSchema(sql); await saveForgeResult(sql, CACHE_TICKET, null, JSON.stringify({ at: Date.now(), body })); } catch { /* best-effort */ } }
  return res.status(200).json({ ...body, cached: false });
}
