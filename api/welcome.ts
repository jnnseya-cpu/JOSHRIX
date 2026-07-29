/**
 * POST /api/welcome — fired by the signup page after a successful registration.
 * Body: { email, name?, website? (honeypot) }
 * Sends the "Welcome to JOSHRIX" email (account.registration.requested) via the
 * comms engine. Abuse-safe: honeypot submissions are swallowed, and each email
 * address ever only receives ONE welcome (deduped against the delivery log) —
 * so the public endpoint cannot be used to spam arbitrary inboxes.
 */
import { notify } from "./_notify";
import { getDb, ensureCommsSchema, hasDelivery } from "./_ledger";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { email, name, website } = (req.body ?? {}) as Record<string, string>;
  if (website) return res.status(200).json({ ok: true });   // honeypot: swallow
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const sql = getDb();
  if (sql) {
    await ensureCommsSchema(sql);
    if (await hasDelivery(sql, "account.registration.requested", email)) {
      return res.status(200).json({ ok: true, deduped: true });   // one welcome per address, ever
    }
  }
  await notify("account.registration.requested", email, { name: (name || "").slice(0, 80) });
  return res.status(200).json({ ok: true });
}
