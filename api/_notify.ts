/**
 * notify() — the one-line bridge from platform flows into the Communication
 * Engine. Any endpoint can fire a catalogue event; it renders the branded
 * email (real send when RESEND_API_KEY is set, sandbox-logged otherwise),
 * records every channel delivery, and NEVER throws — notifications must never
 * break the flow that triggered them.
 */
import { findCommEvent, renderTemplate } from "../shared/comms";
import { renderEmail, sendEmail } from "./comms";
import { getDb, ensureCommsSchema, saveDelivery } from "./_ledger";

export async function notify(eventId: string, to: string | null | undefined, vars: Record<string, string> = {}): Promise<void> {
  try {
    const e = findCommEvent(eventId);
    if (!e) return;
    const subject = renderTemplate(e.subject, vars);
    const sql = getDb();
    if (sql) await ensureCommsSchema(sql);
    for (const ch of e.channels) {
      let status = "logged";
      let provider: string = ch;
      if (ch === "email") {
        if (!to) continue;                       // no address on file — skip email, keep other channels
        const out = await sendEmail(to, subject, renderEmail(subject, e.name, e.mandatory));
        status = out.status; provider = out.provider;
      }
      if (sql) {
        try { await saveDelivery(sql, { event: e.id, channel: ch, recipient: ch === "email" ? to : null, status, provider }); }
        catch { /* delivery log is best-effort */ }
      }
    }
  } catch {
    /* notifications never break the calling flow */
  }
}
