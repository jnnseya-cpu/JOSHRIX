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
  const domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** Email headers must never contain CR/LF (header-injection). */
export function stripHeader(s: string): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, 200);
}
