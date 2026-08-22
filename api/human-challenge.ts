/**
 * GET  /api/human-challenge        — mint a proof-of-work challenge
 * GET  /api/human-challenge?js=1   — serve the browser-side solver
 *
 * The challenge is bound to the caller's IP and signed, so it cannot be traded
 * between clients or re-minted with an easier difficulty. Solving it is the
 * price of a free wallet.
 */
import { issueChallenge, humanVerifyConfigured, SOLVER_JS, DEFAULT_DIFFICULTY } from "./_human";
import { getDb } from "./_ledger";
import { clientIp, rateLimit, tooMany } from "./_guard";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.query?.js) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(SOLVER_JS);
  }

  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  if (!humanVerifyConfigured()) {
    // Honest about being off rather than pretending to protect anything.
    return res.status(200).json({
      configured: false,
      note: "Human verification is not configured on this deployment. Set HUMAN_VERIFY_SECRET to enable it.",
    });
  }

  const ip = clientIp(req);
  const sql = getDb();
  if (sql) {
    // minting is cheap, but not free — this stops a farm pre-mining challenges
    const rl = await rateLimit(sql, "human-challenge:" + ip, 60, 3600);
    if (!rl.ok) return tooMany(res, rl.retryAfter, "verification challenges");
  }

  const difficulty = Number(process.env.HUMAN_VERIFY_DIFFICULTY) || DEFAULT_DIFFICULTY;
  const challenge = issueChallenge(ip, Math.max(8, Math.min(26, difficulty)));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ configured: true, challenge });
}
