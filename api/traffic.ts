/**
 * GET /api/traffic — the acquisition funnel, counted from this platform's own
 * pageview table.
 *
 * Header: x-moderation-key: <MODERATION_KEY>   (or Bearer CRON_SECRET)
 * Query:  ?days=30
 *
 * The point of this endpoint is to make one question answerable that currently
 * is not: WHERE does acquisition break? "No customers" has several very
 * different causes and they need completely different fixes —
 *
 *   nobody arrives            -> a distribution problem
 *   they arrive and bounce    -> a landing-page problem
 *   they play but never forge -> a proposition problem
 *   they forge but never pay  -> a product-quality or pricing problem
 *
 * Every number here is counted. Where something cannot be known it is named
 * under `notMeasured` rather than estimated, because a made-up funnel is worse
 * than no funnel: it feels like evidence.
 */
import { getDb } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const key = process.env.MODERATION_KEY;
  const cron = process.env.CRON_SECRET;
  const ok = (!!key && String(req.headers["x-moderation-key"] ?? "") === key) ||
             (!!cron && String(req.headers["authorization"] ?? "") === `Bearer ${cron}`);
  if (!key && !cron) return res.status(503).json({ error: "Traffic unavailable — set MODERATION_KEY." });
  if (!ok) return res.status(401).json({ error: "Unauthorised." });

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "Traffic unavailable — no database configured." });

  const days = Math.max(1, Math.min(365, Number(req.query?.days) || 30));
  const out: Record<string, unknown> = { windowDays: days };
  const missing: string[] = [];

  async function q(name: string, fn: () => Promise<void>) {
    try { await fn(); } catch { missing.push(name); }
  }

  await q("pageviews", async () => {
    const rows = (await sql`
      SELECT sum(views)::bigint AS views FROM pageviews
      WHERE day > now()::date - ${days}`) as any[];
    out.pageviews = Number(rows[0]?.views ?? 0);
  });

  await q("visitors", async () => {
    const rows = (await sql`
      SELECT count(*)::int AS n FROM visitors WHERE day > now()::date - ${days}`) as any[];
    // one token per visitor per day, so this is visits-by-day, not people
    out.dailyVisitors = Number(rows[0]?.n ?? 0);
  });

  await q("top pages", async () => {
    out.topPages = (await sql`
      SELECT path, sum(views)::bigint AS views FROM pageviews
      WHERE day > now()::date - ${days}
      GROUP BY path ORDER BY views DESC LIMIT 15`) as any[];
  });

  await q("referrers", async () => {
    out.referrers = (await sql`
      SELECT ref, sum(views)::bigint AS views FROM pageviews
      WHERE day > now()::date - ${days}
      GROUP BY ref ORDER BY views DESC LIMIT 15`) as any[];
  });

  await q("daily trend", async () => {
    out.daily = (await sql`
      SELECT day, sum(views)::bigint AS views FROM pageviews
      WHERE day > now()::date - ${days}
      GROUP BY day ORDER BY day DESC LIMIT 60`) as any[];
  });

  /* The funnel. Each step is a real count from a real table. */
  const funnel: Record<string, number> = {};
  await q("funnel: landed", async () => {
    const r = (await sql`
      SELECT sum(views)::bigint AS v FROM pageviews
      WHERE day > now()::date - ${days} AND path = '/'`) as any[];
    funnel.landedOnHome = Number(r[0]?.v ?? 0);
  });
  await q("funnel: reached studio", async () => {
    const r = (await sql`
      SELECT sum(views)::bigint AS v FROM pageviews
      WHERE day > now()::date - ${days} AND path = '/studio'`) as any[];
    funnel.reachedStudio = Number(r[0]?.v ?? 0);
  });
  await q("funnel: signed up", async () => {
    const r = (await sql`
      SELECT count(*)::int AS n FROM wallets
      WHERE created_at > now() - make_interval(days => ${days})`) as any[];
    funnel.walletsCreated = Number(r[0]?.n ?? 0);
  });
  await q("funnel: forged", async () => {
    const r = (await sql`
      SELECT count(*)::int AS n FROM forge_log
      WHERE created_at > now() - make_interval(days => ${days})`) as any[];
    funnel.forgesRun = Number(r[0]?.n ?? 0);
  });
  await q("funnel: paid", async () => {
    const r = (await sql`
      SELECT count(*)::int AS n FROM wallets
      WHERE category <> 'tester' AND created_at > now() - make_interval(days => ${days})`) as any[];
    funnel.payingAccounts = Number(r[0]?.n ?? 0);
  });
  out.funnel = funnel;

  /* Say where it breaks, in plain words, from the numbers above. */
  const v = Number(out.pageviews ?? 0);
  let verdict: string;
  if (!v) {
    verdict = "No pageviews recorded. Either nobody has arrived, or the beacon has not been deployed long enough to see anyone. "
            + "Until this number moves, acquisition work has no feedback loop and every change is a guess.";
  } else if (!funnel.reachedStudio) {
    verdict = "People arrive but nobody reaches the Studio. This is a LANDING PAGE problem — the home page is not "
            + "convincing anyone to try. Change the page, not the product.";
  } else if (!funnel.walletsCreated) {
    verdict = "People reach the Studio and none create an account. This is a SIGNUP FRICTION problem — the login wall "
            + "in front of the forge is the first thing to test removing.";
  } else if (!funnel.forgesRun) {
    verdict = "People sign up and never forge. This is an ONBOARDING problem — they cannot work out what to type.";
  } else if (!funnel.payingAccounts) {
    verdict = "People forge and nobody pays. This is a PRODUCT QUALITY problem — the games are not good enough to buy "
            + "credit for. No amount of marketing fixes this one.";
  } else {
    verdict = "The funnel converts end to end. Optimise the weakest step above.";
  }
  out.whereItBreaks = verdict;

  out.notMeasured = [
    "Individual people over time — the visitor token is rotated daily on purpose, so nobody can be followed across days.",
    "Which referrer led to which signup — no cross-page session is kept.",
    "Time on page, scroll depth and clicks — not instrumented.",
    "Anything before this endpoint was deployed. There is no historical data to recover.",
  ];
  if (missing.length) out.notEvaluated = missing;

  return res.status(200).json(out);
}
