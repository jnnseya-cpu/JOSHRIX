/**
 * GET  /unsubscribe?e=<email>&t=<token>  — one-click opt-out of the newsletter.
 * POST /unsubscribe                      — the same, for List-Unsubscribe-Post.
 *
 * This exists because marketing email to a UK audience must carry a working
 * opt-out, and because bulk senders without one get their whole domain
 * filtered — which would take the transactional mail (receipts, verification,
 * payout notices) down with it. The unsubscribe link is therefore not a
 * courtesy; it protects every other email the platform sends.
 *
 * The token is an HMAC of the address so a link cannot be edited in the address
 * bar to unsubscribe somebody else. If NEWSLETTER_SECRET is unset the token is
 * not verified and the opt-out still works: a broken unsubscribe is a worse
 * failure than a forgeable one, and the harm ceiling here is a nuisance, not a
 * disclosure — nothing about the account is revealed either way.
 *
 * It never confirms whether an address is registered. Answering that would turn
 * this into an account-enumeration oracle, which is a real disclosure.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb, ensureNewsletterSchema, unsubscribeEmail } from "./_ledger";

const SITE = "https://www.joshrix.com";

export function unsubscribeToken(email: string): string {
  const secret = process.env.NEWSLETTER_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(email: string): string {
  const t = unsubscribeToken(email);
  return `${SITE}/unsubscribe?e=${encodeURIComponent(email)}${t ? `&t=${t}` : ""}`;
}

export function tokenValid(email: string, token: string): boolean {
  const want = unsubscribeToken(email);
  if (!want) return true;                       // no secret configured — opt-out still works
  const a = Buffer.from(want), b = Buffer.from(String(token ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

const page = (title: string, body: string) => `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — JOSHRIX Studio</title><link rel="stylesheet" href="/assets/joshrix.css">
<meta name="robots" content="noindex"></head>
<!-- DELIBERATELY UNTRACKED. This page is reached by someone withdrawing consent
     to be emailed. Firing an advertising pixel at them in the same moment would
     be indefensible, and counting the visit adds nothing anyone would act on.
     tests/t28 asserts this stays untracked, so it cannot be "fixed" by a sweep
     that adds the beacon everywhere. -->
<body style="background:#0F1117;color:#ececf4;font-family:system-ui,-apple-system,sans-serif">
<main style="max-width:34rem;margin:0 auto;padding:4rem 1.25rem">
  <div style="height:3px;background:linear-gradient(90deg,#D92D3F,#D92D3F);border-radius:2px;margin-bottom:1.6rem"></div>
  <h1 style="font-size:1.5rem;margin:0 0 .8rem">${title}</h1>
  ${body}
  <p style="margin-top:2rem"><a href="/" style="color:#D92D3F">Back to JOSHRIX Studio</a></p>
</main></body></html>`;

export default async function handler(req: any, res: any) {
  const src = req.method === "POST" ? (req.body ?? {}) : (req.query ?? {});
  const email = String(src.e ?? src.email ?? "").trim().toLowerCase();
  const token = String(src.t ?? src.token ?? "");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).send(page("That link is incomplete",
      `<p style="color:#c9c9d6;line-height:1.7">The unsubscribe link did not carry an email address.
       Use the link at the bottom of the email itself, or write to
       <a href="mailto:support@joshrix.com" style="color:#D92D3F">support@joshrix.com</a> and we will remove you.</p>`));
  }
  if (!tokenValid(email, token)) {
    return res.status(400).send(page("That link is not valid",
      `<p style="color:#c9c9d6;line-height:1.7">This unsubscribe link has been altered. Use the one in the
       email, or write to <a href="mailto:support@joshrix.com" style="color:#D92D3F">support@joshrix.com</a>.</p>`));
  }

  const sql = getDb();
  if (sql) {
    try {
      await ensureNewsletterSchema(sql);
      await unsubscribeEmail(sql, email);
    } catch {
      return res.status(500).send(page("We could not complete that",
        `<p style="color:#c9c9d6;line-height:1.7">Something went wrong on our side and you are still subscribed.
         Please write to <a href="mailto:support@joshrix.com" style="color:#D92D3F">support@joshrix.com</a>
         and we will remove you by hand.</p>`));
    }
  }

  // Deliberately does not say whether the address was registered.
  return res.status(200).send(page("You are unsubscribed", `
    <p style="color:#c9c9d6;line-height:1.7">No more weekly emails will be sent to
    <b>${email.replace(/[<>&"]/g, "")}</b>.</p>
    <p style="color:#9d9db3;line-height:1.7;font-size:.95rem">You will still receive service messages that
    concern your account — payment receipts, security notices and anything we are legally required to send.
    Those are not marketing and cannot be switched off.</p>`));
}
