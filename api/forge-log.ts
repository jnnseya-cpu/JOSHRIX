/**
 * GET /api/forge-log
 * The last 20 forge outcomes, server-side: which provider shipped each build
 * (claude/gemini/openai, or 'engine' when every AI failed) plus the exact
 * aggregated per-provider error text for the failures. Diagnosing a bad run
 * never depends on what the creator's browser happened to display.
 * Contains no game content, wallet ids, or prompts — public-safe.
 */
import { BUILD_ID } from "./_gateway";
import { getDb, ensureGameSchema, listForgeLog } from "./_ledger";

export default async function handler(_req: any, res: any) {
  const sql = getDb();
  if (!sql) return res.status(200).json({ build: BUILD_ID, entries: [], note: "no database configured" });
  try {
    await ensureGameSchema(sql);
    const entries = await listForgeLog(sql, 20);
    return res.status(200).json({ build: BUILD_ID, entries });
  } catch (err: any) {
    return res.status(502).json({ error: "forge log unavailable", detail: String(err?.message ?? err) });
  }
}
