/** Shared request-hardening helpers. */

const ALLOWED_ORIGINS = new Set([
  "https://www.joshrix.com",
  "https://joshrix.com",
  "http://localhost:8787",
  "http://localhost:3000",
]);

/** Stripe success/cancel URLs must never come from attacker-controlled headers. */
export function safeOrigin(req: any): string {
  const o = String(req.headers?.origin ?? "");
  return ALLOWED_ORIGINS.has(o) ? o : "https://www.joshrix.com";
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Canonical form for dedupe: lowercase, strip +tags, collapse gmail dots. */
export function normalizeEmail(email: string): string {
  let e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at === -1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    // googlemail.com IS gmail.com — without collapsing it, one mailbox counts
    // as two identities and earns two free-credit grants
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

/** Email headers must never contain CR/LF (header-injection). */
export function stripHeader(s: string): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, 200);
}

/* ---------------- rate limiting (shared, atomic, Postgres-backed) ----------- */

/** Caller identity for limiting: the real client IP behind Vercel's proxy. */
export function clientIp(req: any): string {
  const xf = String(req.headers?.["x-forwarded-for"] ?? "");
  const first = xf.split(",")[0].trim();
  return (first || String(req.headers?.["x-real-ip"] ?? "") || "unknown").slice(0, 64);
}

/**
 * Fixed-window rate limit, atomic in one statement so concurrent serverless
 * invocations cannot both slip through. Fails OPEN on a database error: a
 * limiter outage must not take the whole platform down with it.
 */
export async function rateLimit(
  sql: any,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; count: number; retryAfter: number }> {
  try {
    await sql`CREATE TABLE IF NOT EXISTS rate_limits (
      key text PRIMARY KEY,
      window_start timestamptz NOT NULL DEFAULT now(),
      count integer NOT NULL DEFAULT 0
    )`;
    const rows = (await sql`
      INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
      RETURNING count, EXTRACT(EPOCH FROM (window_start + make_interval(secs => ${windowSeconds}) - now()))::int AS retry_after
    `) as Array<{ count: number; retry_after: number }>;
    const count = Number(rows[0]?.count ?? 1);
    return { ok: count <= limit, count, retryAfter: Math.max(1, Number(rows[0]?.retry_after ?? windowSeconds)) };
  } catch {
    return { ok: true, count: 0, retryAfter: 0 };   // fail open, never fail shut
  }
}

/** Standard 429 body. Never reveals the limit policy in detail. */
/**
 * Throttle WRONG admin-key attempts, per IP.
 *
 * MODERATION_KEY is the only credential on this platform: it grants ACUs,
 * designates testers, approves payouts — real money leaving the account — and
 * opens the moderation queue and the margin data. Nothing was counting failed
 * attempts, so it could be guessed at network speed indefinitely, which made
 * the length of the key the only thing standing between an attacker and all of
 * that.
 *
 * Ten attempts per fifteen minutes per IP turns an unlimited online guess into
 * a rate no brute force survives. A CORRECT key is never counted, so an
 * operator who mistypes twice and then gets it right is never locked out, and
 * routine admin work never touches the limit at all.
 *
 * Returns true when it has already sent the 429 — the caller just returns.
 */
export async function tooManyBadKeys(sql: any, req: any, res: any): Promise<boolean> {
  if (!sql) return false;                 // no store: the key check itself still stands
  try {
    const rl = await rateLimit(sql, "adminkey:" + clientIp(req), 10, 900);
    if (rl.ok) return false;
    tooMany(res, rl.retryAfter, "admin key attempts");
    return true;
  } catch {
    return false;                         // never lock an operator out on a DB blip
  }
}

export function tooMany(res: any, retryAfter: number, what = "requests") {
  res.setHeader("Retry-After", String(retryAfter));
  return res.status(429).json({
    error: `Too many ${what} — please wait ${retryAfter < 90 ? retryAfter + " seconds" : Math.ceil(retryAfter / 60) + " minutes"} and try again.`,
    retryAfter,
  });
}

/** Global kill switch: set FORGE_DISABLED=1 in the environment to stop all AI
 *  spend instantly without a deploy. Used by the expensive endpoints. */
export function forgeDisabled(): string | null {
  if (String(process.env.FORGE_DISABLED ?? "") === "1") {
    return process.env.FORGE_DISABLED_MESSAGE || "Game generation is paused for maintenance — your ACUs are untouched. Please try again shortly.";
  }
  return null;
}

/* ---------------- single-use nonces and the security event log ------------- */

/**
 * Claim a nonce. Returns true if it had ALREADY been claimed, which is the
 * caller's signal to reject a replay. One statement, so two serverless
 * instances racing the same nonce cannot both win.
 *
 * Fails CLOSED (reports "already seen") on a database error: a proof-of-work
 * solve that cannot be recorded must not be accepted, or the replay protection
 * is only as strong as an attacker's ability to make the database blink.
 */
export async function claimNonce(sql: any, nonce: string, ttlSeconds = 3600): Promise<boolean> {
  try {
    await sql`CREATE TABLE IF NOT EXISTS used_nonces (
      nonce text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    const rows = await sql`
      INSERT INTO used_nonces (nonce) VALUES (${nonce})
      ON CONFLICT (nonce) DO NOTHING
      RETURNING nonce`;
    // opportunistic cleanup so the table cannot grow without bound
    await sql`DELETE FROM used_nonces WHERE created_at < now() - make_interval(secs => ${ttlSeconds * 24})`;
    return rows.length === 0;
  } catch {
    return true;
  }
}

/** Record something worth a human's attention. Never throws: a security log
 *  that can break the request it is observing would be its own vulnerability. */
export async function recordSecurityEvent(
  sql: any,
  kind: string,
  severity: "info" | "warn" | "block",
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await sql`CREATE TABLE IF NOT EXISTS security_events (
      id bigserial PRIMARY KEY,
      kind text NOT NULL,
      severity text NOT NULL,
      detail jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`INSERT INTO security_events (kind, severity, detail)
              VALUES (${kind}, ${severity}, ${JSON.stringify(detail)}::jsonb)`;
  } catch { /* observation must never break the thing observed */ }
}
