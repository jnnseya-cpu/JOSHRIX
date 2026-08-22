/**
 * GET /api/security-agent — the standing security review.
 *
 * Header: x-moderation-key: <MODERATION_KEY>
 * Query:  ?hours=24
 *
 * WHAT THIS IS, PLAINLY: it reads the platform's own tables and reports attacks
 * that are visible in them. It is detection and alerting, not a shield. Nothing
 * here stops an attack in flight — the blocking is done inline, deterministically,
 * by _security.ts on every forge and _human.ts on every signup. This is the part
 * that notices patterns a single request cannot show: one address opening
 * accounts all night, one IP grinding the forge, a run of builds that all tripped
 * the malware scan.
 *
 * It deliberately does NOT use a model to decide anything. A detector that can be
 * argued with is a detector an attacker can argue with, and the input here is
 * attacker-controlled by definition. Rules decide; a human reads the summary.
 */
import { getDb } from "./_ledger";
import { recordSecurityEvent } from "./_guard";

type Finding = {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: unknown;
  action: string;
};

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  /* Two callers, both authenticated. An operator sends the moderation key by
     hand; the nightly Vercel cron cannot set custom headers, so it carries
     Bearer CRON_SECRET — the same pattern the blog cron already uses. Fails
     closed when neither secret is configured. */
  const key = process.env.MODERATION_KEY;
  const cron = process.env.CRON_SECRET;
  const byOperator = !!key && String(req.headers["x-moderation-key"] ?? "") === key;
  const byCron = !!cron && String(req.headers["authorization"] ?? "") === `Bearer ${cron}`;
  if (!key && !cron) {
    return res.status(503).json({ error: "Security review unavailable — set MODERATION_KEY (operator) or CRON_SECRET (scheduled run)." });
  }
  if (!byOperator && !byCron) return res.status(401).json({ error: "Unauthorised." });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Security review unavailable — no database configured." });

  const hours = Math.max(1, Math.min(720, Number(req.query?.hours) || 24));
  const findings: Finding[] = [];
  const checked: string[] = [];
  const unavailable: string[] = [];

  /** Run one check; a missing table must not take the whole review down. */
  async function check(name: string, fn: () => Promise<void>) {
    try { await fn(); checked.push(name); }
    catch { unavailable.push(name); }
  }

  await check("generated builds rejected as malicious", async () => {
    const rows = (await sql`
      SELECT detail, created_at FROM security_events
      WHERE kind = 'malicious_build_blocked'
        AND created_at > now() - make_interval(hours => ${hours})
      ORDER BY created_at DESC LIMIT 50`) as any[];
    if (rows.length) {
      findings.push({
        severity: rows.length >= 3 ? "critical" : "high",
        title: `${rows.length} generated build(s) blocked by the security scan`,
        detail: "A build tried to do something a game never needs to do — reach an outside host, "
              + "collect a password, hide code behind eval, or embed another site. One can be a "
              + "confused model; a run of them is someone probing the forge.",
        evidence: rows.slice(0, 10),
        action: "Read the concepts behind these. If one wallet is responsible, freeze it.",
      });
    }
  });

  await check("failed human verification", async () => {
    const rows = (await sql`
      SELECT detail->>'ip' AS ip, count(*)::int AS n
      FROM security_events
      WHERE kind IN ('human_verification_failed','disposable_email_blocked')
        AND created_at > now() - make_interval(hours => ${hours})
      GROUP BY 1 ORDER BY n DESC LIMIT 20`) as any[];
    const heavy = rows.filter((r) => r.n >= 10);
    if (heavy.length) {
      findings.push({
        severity: "high",
        title: `${heavy.length} address(es) repeatedly failing the signup check`,
        detail: "Sustained failures from one address are an account farm being built, not a person "
              + "struggling with a form. Each wallet it lands is worth real AI spend.",
        evidence: heavy,
        action: "Block these addresses at the edge, and raise HUMAN_VERIFY_DIFFICULTY if it continues.",
      });
    }
  });

  await check("wallet creation rate", async () => {
    const rows = (await sql`
      SELECT date_trunc('hour', created_at) AS hour, count(*)::int AS n
      FROM wallets WHERE created_at > now() - make_interval(hours => ${hours})
      GROUP BY 1 ORDER BY n DESC LIMIT 5`) as any[];
    const worst = rows[0];
    if (worst && worst.n >= 50) {
      findings.push({
        severity: worst.n >= 200 ? "critical" : "high",
        title: `${worst.n} wallets created in a single hour`,
        detail: "Every wallet carries a starter grant of real AI credit. This rate is either genuine "
              + "launch traffic or an account farm, and the two are worth telling apart quickly.",
        evidence: rows,
        action: "Cross-check against signups with a verified email. If they do not match, the grant is being farmed.",
      });
    }
  });

  await check("forge abuse by address", async () => {
    // Read the rate limiter's own counters rather than logging IPs against every
    // forge: the data already exists, and the platform gains no new personal
    // data it would then have to protect.
    const rows = (await sql`
      SELECT key, count FROM rate_limits
      WHERE key LIKE 'forge:%' AND count >= 20
        AND window_start > now() - make_interval(hours => ${hours})
      ORDER BY count DESC LIMIT 20`) as any[];
    if (rows.length) {
      findings.push({
        severity: "medium",
        title: `${rows.length} address(es) at or near the forge limit`,
        detail: "Inside the limit but far above normal use. Worth confirming these are paying.",
        evidence: rows,
        action: "Check the wallets behind them are funded and settling charges.",
      });
    }
  });

  await check("negative or runaway balances", async () => {
    const rows = (await sql`
      SELECT id, balance, category FROM wallets
      WHERE balance < 0 OR balance > 5000000 ORDER BY balance ASC LIMIT 20`) as any[];
    if (rows.length) {
      findings.push({
        severity: "critical",
        title: `${rows.length} wallet(s) with an impossible balance`,
        detail: "A negative balance means AI was spent that was never paid for. A vast one means "
              + "credits were granted outside the normal path. Either is a hole in the ledger.",
        evidence: rows,
        action: "Reconcile against ledger_postings before anything else on this list.",
      });
    }
  });

  await check("repeat rate-limit offenders", async () => {
    const rows = (await sql`
      SELECT key, count FROM rate_limits
      WHERE count > 200 AND window_start > now() - make_interval(hours => ${hours})
      ORDER BY count DESC LIMIT 20`) as any[];
    if (rows.length) {
      findings.push({
        severity: "medium",
        title: `${rows.length} caller(s) hammering a rate-limited endpoint`,
        detail: "The limiter is holding, but this is someone testing where the wall is.",
        evidence: rows,
        action: "If one key dominates, block it upstream rather than paying to reject it every time.",
      });
    }
  });

  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const worst = findings[0]?.severity ?? null;
  if (worst === "critical" || worst === "high") {
    await recordSecurityEvent(sql, "security_review_alert", "warn", {
      worst, count: findings.length, titles: findings.map((f) => f.title),
    });
  }

  return res.status(200).json({
    windowHours: hours,
    status: findings.length === 0 ? "clear" : worst,
    findings,
    checksRun: checked,
    checksUnavailable: unavailable,
    honesty: [
      "This is detection over this platform's own tables. It cannot see attacks that leave no trace here.",
      "Blocking happens inline: _security.ts scans every generated build, _human.ts gates every new wallet.",
      "No model is asked to judge anything on this path — the input is attacker-controlled by definition.",
      unavailable.length
        ? `Not evaluated (table missing or unreadable): ${unavailable.join(", ")}.`
        : "Every check ran.",
    ],
  });
}
