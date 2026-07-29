/**
 * /api/comms — the JOSHRIX Communication Event Engine.
 *   GET                       → catalogue + stats (event ids, channels, mandatory flags)
 *   GET ?preview=<eventId>    → branded HTML email preview (exactly what recipients get)
 *   GET ?deliveries=1         → recent delivery log (admin key)
 *   POST { event, to, vars? } → fire an event to a recipient across its channels (admin key)
 * Email sends REAL mail when RESEND_API_KEY is set (from COMMS_FROM, default
 * no-reply@joshrix.com); without a provider key every channel records a sandbox
 * "logged" delivery so the whole engine stays testable. In-app deliveries are
 * logged for the recipient's feed; SMS/push/WhatsApp log until providers are wired.
 */
import { COMM_CATALOGUE, commStats, findCommEvent, renderTemplate } from "../shared/comms";
import { getDb, ensureCommsSchema, saveDelivery, listDeliveries } from "./_ledger";

const esc = (s: unknown) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

/** Branded email shell — hex logo, gradient rule, dark theme, footer notices. */
export function renderEmail(subject: string, eventName: string, mandatory: boolean): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#0b0b14;font-family:system-ui,-apple-system,sans-serif;color:#ececf4">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <table role="presentation" style="width:100%"><tr>
    <td style="width:42px"><div style="width:34px;height:34px;background:linear-gradient(135deg,#7C3AED,#22D3EE);border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff">JX</div></td>
    <td style="font-weight:800;letter-spacing:.08em">JOSHRIX <span style="color:#22D3EE">STUDIO</span></td>
  </tr></table>
  <div style="height:3px;background:linear-gradient(90deg,#7C3AED,#22D3EE);border-radius:2px;margin:16px 0 22px"></div>
  <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9d9db3;margin:0 0 6px">${esc(eventName)}</p>
  <h1 style="font-size:20px;line-height:1.35;margin:0 0 14px">${esc(subject)}</h1>
  <p style="color:#c9c9d6;line-height:1.7;font-size:15px;margin:0 0 22px">This is the JOSHRIX notification for <b>${esc(eventName)}</b>. Open your studio for the full details and any actions waiting for you.</p>
  <a href="https://www.joshrix.com/dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#22D3EE);color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px">Open JOSHRIX</a>
  <p style="color:#6b6b80;font-size:12px;line-height:1.6;margin:26px 0 0">© 2026 JOSHRIX Studio · Create Worlds. Build Games. Own the Future.<br>
  ${mandatory ? "This is a mandatory service notice — it is sent even when marketing emails are switched off." : "You can adjust which updates you receive in your profile."}
  · <a href="https://www.joshrix.com/privacy.html" style="color:#22D3EE">Privacy</a></p>
</div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ status: string; provider: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "logged", provider: "sandbox" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.COMMS_FROM || "JOSHRIX <no-reply@joshrix.com>", to: [to], subject, html }),
    });
    return r.ok ? { status: "sent", provider: "resend" } : { status: "failed", provider: "resend" };
  } catch {
    return { status: "failed", provider: "resend" };
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  const adminOk = !!process.env.MODERATION_KEY && req.headers?.["x-admin-key"] === process.env.MODERATION_KEY;

  if (req.method === "GET") {
    const previewId = String(req.query?.preview ?? "");
    if (previewId) {
      const e = findCommEvent(previewId);
      if (!e) return res.status(404).json({ error: "Unknown event" });
      const html = renderEmail(renderTemplate(e.subject), e.name, e.mandatory);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send ? res.status(200).send(html) : (res.status(200), res.end(html));
    }
    if (String(req.query?.deliveries ?? "") === "1") {
      if (!adminOk) return res.status(401).json({ error: "Admin key required" });
      const sql = getDb();
      if (!sql) return res.status(200).json({ deliveries: [], mode: "no_db" });
      await ensureCommsSchema(sql);
      return res.status(200).json({ deliveries: await listDeliveries(sql) });
    }
    return res.status(200).json({ stats: commStats(), catalogue: COMM_CATALOGUE, emailProvider: process.env.RESEND_API_KEY ? "resend" : "sandbox" });
  }

  if (req.method === "POST") {
    if (!adminOk) return res.status(401).json({ error: "Admin key required" });
    const { event, to, vars } = (req.body ?? {}) as { event?: string; to?: string; vars?: Record<string, string> };
    const e = findCommEvent(String(event ?? ""));
    if (!e) return res.status(404).json({ error: "Unknown event id" });
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: "A valid recipient email is required (`to`)" });

    const subject = renderTemplate(e.subject, vars || {});
    const sql = getDb();
    if (sql) await ensureCommsSchema(sql);
    const deliveries: Array<{ channel: string; status: string; provider: string }> = [];
    for (const ch of e.channels) {
      let out = { status: "logged", provider: ch === "email" ? "sandbox" : ch };
      if (ch === "email") out = await sendEmail(to, subject, renderEmail(subject, e.name, e.mandatory));
      deliveries.push({ channel: ch, ...out });
      if (sql) { try { await saveDelivery(sql, { event: e.id, channel: ch, recipient: to, status: out.status, provider: out.provider }); } catch { /* log best-effort */ } }
    }
    return res.status(200).json({ ok: true, event: e.id, subject, mandatory: e.mandatory, deliveries });
  }

  return res.status(405).json({ error: "GET or POST only" });
}
