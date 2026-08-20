/**
 * GET /api/newsletter — the weekly mailing to registered accounts.
 *
 * Auth: x-moderation-key === MODERATION_KEY (operator), or the Vercel Cron
 * `Authorization: Bearer CRON_SECRET` header — the same pattern the blog and
 * security crons already use. Fails closed: an endpoint that mails every
 * registered user must never be triggerable by a stranger with a URL.
 *
 * Content is built from api/_features.ts, the blog archive and the approved
 * games, so the mailing is assembled from what the platform verifiably has
 * rather than from copy written once and left to rot. Features rotate by week
 * number, so consecutive issues sell different capabilities instead of
 * repeating the same three.
 *
 * Two rules this endpoint exists to honour:
 *
 * 1. IDEMPOTENT. Each address is CLAIMED for the issue before the send, via a
 *    unique constraint. A retried cron therefore cannot mail anyone twice — and
 *    a duplicate mailing is not a cosmetic bug, it is spam complaints and a
 *    burnt sending domain, which no later fix recovers.
 * 2. OPT-OUT IS REAL. Unsubscribed addresses are excluded in the query, not
 *    filtered in the mail loop, so there is no path where a send happens first
 *    and the check happens second.
 *
 * ?dry=1 renders the issue and reports the audience without sending anything.
 */
import { FEATURES } from "./_features";
import { renderNewsletter, sendEmail, emailProvider, type NewsletterSection } from "./comms";
import {
  getDb, ensureNewsletterSchema, newsletterAudience, claimNewsletterSend,
  recordNewsletterSend, listBlogPosts, listApprovedGames,
} from "./_ledger";
import { unsubscribeUrl } from "./unsubscribe";

const SITE = "https://www.joshrix.com";
/** One run mails at most this many. Vercel caps a function's wall clock, and a
 *  half-finished run that loses its place would re-send; claiming per address
 *  means the next run simply continues where this one stopped. */
const BATCH = 200;

/** ISO-8601 week — the issue identity, and the rotation key for content. */
export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);              // Thursday decides the year
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Rotate through the whole feature list so issue N and issue N+1 do not sell
 *  the same things. With 22 features and 4 per issue the cycle is ~6 months. */
export function featuresForIssue(issue: string, count = 4) {
  const week = Number(issue.slice(-2)) || 1;
  const start = ((week - 1) * count) % FEATURES.length;
  const out = [];
  for (let i = 0; i < Math.min(count, FEATURES.length); i++) out.push(FEATURES[(start + i) % FEATURES.length]);
  return out;
}

export async function buildIssue(issue: string) {
  const picked = featuresForIssue(issue);
  const sections: NewsletterSection[] = [{
    heading: "What you can do with your account",
    blurb: "Four capabilities this week, each with the specifics behind it.",
    links: picked.map((f) => ({ href: f.href, label: f.name, note: f.proof[0] })),
  }];

  const sql = getDb();
  if (sql) {
    try {
      const posts = await listBlogPosts(sql, 4);
      if (posts.length) {
        sections.push({
          heading: "New on the blog",
          links: posts.map((p: any) => ({ href: `/blog/${p.slug}`, label: String(p.title) })),
        });
      }
    } catch { /* the issue is still worth sending without the archive */ }
    try {
      const games = await listApprovedGames(sql, 5);
      if (games.length) {
        sections.push({
          heading: "Playable now in the Arcade",
          blurb: "No account needed to play — share any of these with anyone.",
          links: games.map((g: any) => ({ href: `/play/${g.id}`, label: String(g.title ?? g.id) })),
        });
      }
    } catch { /* ditto */ }
  }

  // Always present, so an issue is never a thin mail of links to nothing.
  sections.push({
    heading: "Start here",
    links: [
      { href: "/games/midnight-post", label: "Play Midnight Post", note: "Drive the night post van. Eight parcels, one night, no download." },
      { href: "/games/wonderverse", label: "Play WonderVerse", note: "A 3D game made on the platform. No download, no account." },
      { href: "/games/dino-island", label: "Play Dino Island", note: "Works on a phone as well as a desktop." },
      { href: "/features", label: "Every capability, with the numbers behind it" },
      { href: "/pricing", label: "Pricing — pay for the compute a build used, not a quota" },
      { href: "/arcade", label: "Browse the Arcade" },
      { href: "/marketplace", label: "Sell what you make" },
    ],
  });

  return {
    issue,
    headline: `${picked[0].name} — and three more things your account already does`,
    intro: "A short weekly note on what JOSHRIX Studio can do for you, with a link to every part of it. "
         + "Nothing here is a promise: each line is something the platform does today.",
    sections,
  };
}

function authorised(req: any): boolean {
  const key = process.env.MODERATION_KEY;
  const cron = process.env.CRON_SECRET;
  if (key && String(req.headers?.["x-moderation-key"] ?? "") === key) return true;
  if (cron && String(req.headers?.["authorization"] ?? "") === `Bearer ${cron}`) return true;
  return false;
}

export default async function handler(req: any, res: any) {
  if (!authorised(req)) {
    return res.status(503).json({ error: "Newsletter send unavailable — set MODERATION_KEY (operator) or CRON_SECRET (scheduled run)." });
  }

  const issue = isoWeek();
  const built = await buildIssue(issue);
  const dry = String(req.query?.dry ?? "") === "1";

  const sql = getDb();
  if (!sql) return res.status(503).json({ error: "No database configured — cannot determine the audience." });

  await ensureNewsletterSchema(sql);
  const audience = await newsletterAudience(sql, issue, BATCH);

  if (dry) {
    return res.status(200).json({
      issue, provider: emailProvider(), wouldSend: audience.length,
      sections: built.sections.map((s) => ({ heading: s.heading, links: s.links.length })),
      note: "Dry run — nothing was sent and no address was claimed.",
    });
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const email of audience) {
    // Claim BEFORE sending: if this throws or the function is killed midway,
    // the claim is what stops the next run mailing the same person again.
    if (!(await claimNewsletterSend(sql, email, issue))) { skipped++; continue; }
    try {
      const html = renderNewsletter({ ...built, unsubscribeUrl: unsubscribeUrl(email) });
      const out = await sendEmail(email, `JOSHRIX Studio — ${built.headline}`, html);
      await recordNewsletterSend(sql, email, issue, out.status, out.provider);
      sent++;
    } catch {
      await recordNewsletterSend(sql, email, issue, "failed", emailProvider()).catch(() => {});
      failed++;
    }
  }

  return res.status(200).json({
    issue, provider: emailProvider(), sent, failed,
    alreadyClaimed: skipped,
    remaining: audience.length === BATCH ? "more addresses may remain — the next run continues" : 0,
  });
}
