/**
 * GET /api/forge-result?ticket=<uuid>&w=<walletId>
 * Second delivery channel for a finished forge. forge-game persists every
 * completed build under the client-minted ticket BEFORE responding; if the
 * original connection died (Wi-Fi blip, sleep, platform reset) the Studio's
 * poller retrieves the same game here — a completed forge can never be lost.
 * Wallet-bound: only the wallet that paid for the forge may fetch it.
 */
import { getDb, ensureGameSchema, getForgeResult } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const ticket = String(req.query?.ticket || "");
  const w = String(req.query?.w || "");
  if (!/^[a-z0-9-]{8,64}$/i.test(ticket)) return res.status(400).json({ error: "valid ticket required" });

  const sql = getDb();
  if (!sql) return res.status(200).json({ ready: false, reason: "no ledger" });

  try {
    await ensureGameSchema(sql);
    const row = await getForgeResult(sql, ticket);
    if (!row) return res.status(200).json({ ready: false });
    if (row.wallet_id && row.wallet_id !== w) return res.status(403).json({ error: "not your forge" });
    const payload = JSON.parse(row.payload);
    return res.status(200).json({ ready: true, ...payload });
  } catch (err: any) {
    return res.status(502).json({ error: "lookup failed", detail: String(err?.message ?? err) });
  }
}
