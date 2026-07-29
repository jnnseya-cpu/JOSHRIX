/**
 * POST /api/contact — the one door to the studio.
 * Body: { name, email, topic, message, website? (honeypot) }
 * Sends the message to the studio inbox (CONTACT_INBOX env, else the SMTP
 * mailbox) via the comms email rail and logs the delivery. Honeypot-filled
 * submissions are accepted-and-dropped so bots learn nothing.
 */
import { sendEmail } from "./comms";
import { getDb, ensureCommsSchema, saveDelivery, countRecentDeliveries } from "./_ledger";
import { EMAIL_RE, stripHeader } from "./_guard";

const esc = (s: unknown) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { name, email, topic, message, website } = (req.body ?? {}) as Record<string, string>;
  if (website) return res.status(200).json({ ok: true }); // honeypot: swallow silently
  if (!name || name.length < 2 || name.length > 120) return res.status(400).json({ error: "Please give your name." });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: "A valid email is required so we can reply." });
  if (!message || message.length < 10 || message.length > 5000) return res.status(400).json({ error: "Message must be 10–5,000 characters." });

  const inbox = process.env.CONTACT_INBOX || process.env.SMTP_USER;
  if (!inbox) return res.status(503).json({ error: "Contact inbox not configured yet — email us directly." });

  const sqlPre = getDb();
  if (sqlPre) {
    await ensureCommsSchema(sqlPre);
    // inbox-flood throttle: 30 contact messages per hour, globally
    if (await countRecentDeliveries(sqlPre, "contact.message", 60) >= 30) {
      return res.status(429).json({ error: "The contact desk is very busy — please try again in an hour or email us directly." });
    }
  }

  // header-injection-safe subject (no CR/LF ever reaches the mail headers)
  const subject = stripHeader(`[Contact · ${(topic || "General").slice(0, 40)}] ${name.slice(0, 60)}`);
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0b0b14;font-family:system-ui,sans-serif;color:#ececf4">
<div style="max-width:560px;margin:0 auto;padding:26px 20px">
  <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9d9db3;margin:0 0 6px">joshrix.com contact form</p>
  <h1 style="font-size:18px;margin:0 0 14px">${esc(subject)}</h1>
  <table style="width:100%;font-size:14px;color:#c9c9d6;border-collapse:collapse">
    <tr><td style="padding:4px 10px 4px 0;color:#9d9db3">From</td><td>${esc(name)} &lt;${esc(email)}&gt;</td></tr>
    <tr><td style="padding:4px 10px 4px 0;color:#9d9db3">Topic</td><td>${esc(topic || "General")}</td></tr>
  </table>
  <div style="border:1px solid #26263a;border-radius:10px;padding:14px 16px;margin-top:14px;line-height:1.7;font-size:15px;white-space:pre-wrap">${esc(message)}</div>
  <p style="color:#6b6b80;font-size:12px;margin-top:18px">Reply directly to ${esc(email)}.</p>
</div></body></html>`;

  const out = await sendEmail(inbox, subject, html);
  const sql = getDb();
  if (sql) {
    try { await ensureCommsSchema(sql); await saveDelivery(sql, { event: "contact.message", channel: "email", recipient: inbox, status: out.status, provider: out.provider }); } catch { /* best-effort */ }
  }
  if (out.status === "failed") return res.status(502).json({ error: "Could not send right now — please try again in a minute." });
  return res.status(200).json({ ok: true, status: out.status });
}
