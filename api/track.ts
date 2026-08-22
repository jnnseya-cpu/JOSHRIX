/**
 * POST /api/track — first-party, cookieless pageview counting.
 *
 * The platform currently has NO traffic measurement of any kind. "Not a single
 * customer" and "nobody has visited" are very different problems with very
 * different fixes, and right now they are indistinguishable, so every decision
 * about acquisition is a guess.
 *
 * Deliberately minimal, and privacy-respecting by construction:
 *   - no cookies, no localStorage, no third-party script, no ad network
 *   - the IP is never stored. It is hashed with the user agent, the date and a
 *     server secret to make a visitor token that cannot be reversed and that
 *     changes every midnight, so nobody can be followed across days.
 *   - only the path and the REFERRER'S HOST are kept, never the full referring
 *     URL, which can carry search terms and private identifiers.
 *
 * That is enough to answer the questions that actually matter: is anyone
 * arriving, where from, what do they look at, and do they reach the studio.
 */
import { createHash } from "node:crypto";
import { getDb } from "./_ledger";
import { clientIp, rateLimit, tooMany } from "./_guard";

/** Only paths this site actually serves — a bot posting junk must not be able
 *  to fill the table with arbitrary strings. */
function safePath(p: string): string | null {
  const s = String(p ?? "").split("?")[0].split("#")[0];
  if (!s.startsWith("/") || s.length > 120) return null;
  if (!/^[A-Za-z0-9/_.-]*$/.test(s)) return null;
  return s.replace(/\.html$/, "") || "/";
}

function refHost(r: string): string {
  const raw = String(r ?? "").trim();
  // A campaign token (e.g. "newsletter.campaign") is not a URL and never will
  // be: an email client sends no referrer, so the source has to be declared.
  // Accept only this narrow shape so the column still holds host-like tokens
  // and can never be used to smuggle a full URL, which is the whole point of
  // keeping hosts rather than referrers.
  if (/^[a-z0-9_-]{1,32}\.campaign$/i.test(raw)) return raw.toLowerCase();
  try {
    const h = new URL(raw).hostname.toLowerCase();
    if (!h || h.endsWith("joshrix.com")) return "direct";
    return h.slice(0, 80);
  } catch { return "direct"; }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const sql = getDb();
  if (!sql) return res.status(204).end();          // measurement must never break a page

  const ip = clientIp(req);
  const rl = await rateLimit(sql, "track:" + ip, 300, 3600);
  if (!rl.ok) return tooMany(res, rl.retryAfter, "pageviews");

  const path = safePath((req.body ?? {}).path);
  if (!path) return res.status(204).end();

  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.TRACK_SALT || process.env.MODERATION_KEY || "joshrix";
  // rotates daily, so the token cannot link one visitor across days
  const visitor = createHash("sha256")
    .update([ip, String(req.headers["user-agent"] ?? ""), day, salt].join("|"))
    .digest("hex").slice(0, 32);

  try {
    await sql`CREATE TABLE IF NOT EXISTS pageviews (
      day date NOT NULL,
      path text NOT NULL,
      ref text NOT NULL,
      views bigint NOT NULL DEFAULT 0,
      PRIMARY KEY (day, path, ref)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS visitors (
      day date NOT NULL,
      token text NOT NULL,
      PRIMARY KEY (day, token)
    )`;
    await sql`INSERT INTO pageviews (day, path, ref, views)
              VALUES (${day}::date, ${path}, ${refHost((req.body ?? {}).ref)}, 1)
              ON CONFLICT (day, path, ref) DO UPDATE SET views = pageviews.views + 1`;
    await sql`INSERT INTO visitors (day, token) VALUES (${day}::date, ${visitor})
              ON CONFLICT DO NOTHING`;
    // the visitor table only exists to count uniques per day; nothing needs it after
    await sql`DELETE FROM visitors WHERE day < now()::date - 90`;
  } catch { /* a counter must never take down the page it is counting */ }

  return res.status(204).end();
}
