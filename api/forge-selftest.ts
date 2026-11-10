/**
 * GET /api/forge-selftest
 * The diagnostic that the tiny "say OK" probe can't be: every configured AI
 * provider writes a COMPLETE real game at live forge size, in parallel, and the
 * response reports exactly what each returned — size, canvas, tokens, duration —
 * or the exact error it died with (deadline abort, truncation, HTTP failure).
 * This answers "why do full-size forges fail when the health probe passes"
 * from one URL, with no Studio session and no browser-cache dependency.
 *
 *   ?mode=2d    the 2D chain (default — unchanged behaviour)
 *   ?mode=3d    the 3D chain: GAME_SYSTEM_3D, 3D budgets, 3D quality gate
 *   ?mode=both  both lanes, which is six full-size generations
 *
 * WHY 3D MATTERS HERE. "Run one 3D forge and send the build log" has been the
 * dominant launch blocker for six weeks, and this diagnostic — which answers
 * exactly that question, from one URL, with no wallet and no Studio session —
 * tested only the 2D lane and was linked from no page. Both are fixed: 3D is a
 * mode, and /admin has a button.
 *
 * Every result is judged by `judgeBuild`, the same gate the live forge uses, so
 * `wouldShip` means the build would have been delivered rather than merely that
 * bytes came back.
 *
 * Cost control: a fresh run makes three full-size generations per mode (real
 * provider spend), so unauthenticated calls are served from a 10-minute cache
 * per mode; the admin key (?key= or x-admin-key) forces a fresh run.
 */
import { fullSizeProbe, BUILD_ID } from "./_gateway";
import { getDb, ensureGameSchema, saveForgeResult, getForgeResult } from "./_ledger";

const CACHE_MS = 600_000;
/** Cached per mode: a 2D result must never be served as an answer about 3D. */
const cacheTicket = (mode: string) => `forge-selftest-cache-${mode}`;

export default async function handler(req: any, res: any) {
  const key = (req.headers["x-admin-key"] as string) || (req.query?.key as string) || "";
  const isAdmin = !!process.env.MODERATION_KEY && key === process.env.MODERATION_KEY;

  const asked = String(req.query?.mode ?? "2d").toLowerCase();
  if (!["2d", "3d", "both"].includes(asked)) {
    return res.status(400).json({ error: "mode must be 2d, 3d or both" });
  }
  const modes: Array<"2d" | "3d"> = asked === "both" ? ["2d", "3d"] : [asked as "2d" | "3d"];

  const sql = getDb();
  if (!isAdmin && sql) {
    try {
      await ensureGameSchema(sql);
      const row = await getForgeResult(sql, cacheTicket(asked));
      if (row) {
        const cached = JSON.parse(row.payload);
        if (cached && cached.at && Date.now() - cached.at < CACHE_MS) {
          return res.status(200).json({ ...cached.body, cached: true, ageSeconds: Math.round((Date.now() - cached.at) / 1000) });
        }
      }
    } catch { /* run live */ }
  }

  const t0 = Date.now();
  /* Lanes run in SEQUENCE, not in parallel. Six simultaneous full-size
     generations is six times the peak provider load for no diagnostic gain, and
     a rate limit tripped by the probe itself would be reported as a provider
     failure. */
  const lanes: Record<string, any> = {};
  for (const mode of modes) {
    const providers = await fullSizeProbe(mode);
    const names = ["claude", "gemini", "openai"] as const;
    lanes[mode] = {
      providers,
      /* TWO DIFFERENT NUMBERS, both worth having. `answered` is how many
         providers returned a file at all; `wouldShip` is how many produced one
         the forge would actually have delivered. A lane where all three answer
         and none would ship is the exact failure the old probe could not
         describe. */
      answered: names.filter((n) => providers[n]?.ok).length,
      wouldShip: names.filter((n) => providers[n]?.wouldShip).length,
      of: 3,
    };
  }

  const body = {
    build: BUILD_ID, mode: asked, lanes, totalMs: Date.now() - t0,
    /* Kept for anything that read the old flat shape. */
    providers: lanes[modes[0]].providers,
    healthy: lanes[modes[0]].answered,
    of: 3,
  };
  if (sql) { try { await ensureGameSchema(sql); await saveForgeResult(sql, cacheTicket(asked), null, JSON.stringify({ at: Date.now(), body })); } catch { /* best-effort */ } }
  return res.status(200).json({ ...body, cached: false });
}
