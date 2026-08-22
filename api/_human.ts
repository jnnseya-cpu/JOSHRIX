/**
 * Human verification for account creation.
 *
 * BE CLEAR ABOUT WHAT THIS IS. No server-side check can prove a human is at
 * the keyboard. Anything that runs in a browser can be driven by a script, and
 * anything solvable by a person is solvable by a model. What this does is make
 * automated account creation EXPENSIVE and NOISY instead of free and silent:
 *
 *   - proof of work: every account costs real CPU seconds, so farming 10,000
 *     wallets stops being free. One signup is ~1s; ten thousand is hours.
 *   - a signed, single-use, short-lived challenge: no replaying one solve
 *   - a honeypot field and a minimum fill time: catches naive form-fillers
 *   - disposable-mailbox rejection: closes the cheapest identity supply
 *
 * That matters here because a free wallet is worth 2,000 ACUs of real AI spend.
 * The point is not to be unbeatable; it is to make the attack cost more than
 * the credits are worth, and to leave a trail when someone tries.
 *
 * If HUMAN_VERIFY_SECRET is unset the module reports `configured: false` and
 * callers fall back to their existing rate limits, so a missing env var
 * degrades to today's behaviour instead of locking every user out.
 */
import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";

const TTL_MS = 10 * 60 * 1000;          // a challenge is valid for ten minutes
export const DEFAULT_DIFFICULTY = 18;   // leading zero BITS — ~0.3-1s in a browser

function secret(): string | null {
  return process.env.HUMAN_VERIFY_SECRET || null;
}
export function humanVerifyConfigured(): boolean {
  return !!secret();
}

/* --------------------------- challenge issue --------------------------- */

export type Challenge = { nonce: string; issued: number; difficulty: number; sig: string };

/** Mint a challenge bound to the caller. The signature is what stops a client
 *  inventing an easy challenge and solving that instead. */
export function issueChallenge(bindTo: string, difficulty = DEFAULT_DIFFICULTY): Challenge | null {
  const key = secret();
  if (!key) return null;
  const nonce = randomBytes(16).toString("hex");
  const issued = Date.now();
  const sig = sign(key, nonce, issued, difficulty, bindTo);
  return { nonce, issued, difficulty, sig };
}

function sign(key: string, nonce: string, issued: number, difficulty: number, bindTo: string): string {
  return createHmac("sha256", key).update([nonce, issued, difficulty, bindTo].join("|")).digest("hex");
}

/* ---------------------------- verification ----------------------------- */

export type SolveAttempt = {
  nonce?: string; issued?: number; difficulty?: number; sig?: string; solution?: string;
  /** must be empty — a field hidden from people and filled in by form-fillers */
  website?: string;
  /** ms the form was on screen before submit */
  elapsedMs?: number;
};

export type HumanVerdict = { ok: boolean; reason?: string; configured: boolean };

/** Count leading zero BITS of a hex digest. Bits, not characters, so difficulty
 *  can be tuned finely instead of jumping 16x per step. */
function leadingZeroBits(hex: string): number {
  let bits = 0;
  for (let i = 0; i < hex.length; i++) {
    const v = parseInt(hex[i], 16);
    if (v === 0) { bits += 4; continue; }
    if (v < 2) return bits + 3;
    if (v < 4) return bits + 2;
    if (v < 8) return bits + 1;
    return bits;
  }
  return bits;
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Check a solve. `seen` is a callback that records the nonce and returns true
 * if it had already been used — pass a database-backed one so a solve cannot be
 * replayed across serverless instances.
 */
export async function verifyHuman(
  attempt: SolveAttempt,
  bindTo: string,
  seen?: (nonce: string) => Promise<boolean>,
): Promise<HumanVerdict> {
  const key = secret();
  if (!key) return { ok: true, configured: false };

  // A hidden field a person never sees. Anything in it means a script filled
  // the form in blind.
  if (attempt.website) return { ok: false, configured: true, reason: "honeypot field was filled in" };

  // Nobody reads a signup form and types an email in under a second and a half.
  if (typeof attempt.elapsedMs === "number" && attempt.elapsedMs >= 0 && attempt.elapsedMs < 1500) {
    return { ok: false, configured: true, reason: "form submitted faster than a person can read it" };
  }

  const { nonce, issued, difficulty, sig, solution } = attempt;
  if (!nonce || !issued || !difficulty || !sig || !solution) {
    return { ok: false, configured: true, reason: "verification challenge missing" };
  }
  if (!sameString(sig, sign(key, nonce, issued, difficulty, bindTo))) {
    return { ok: false, configured: true, reason: "challenge signature does not match this caller" };
  }
  if (Date.now() - issued > TTL_MS) return { ok: false, configured: true, reason: "challenge expired" };
  if (issued > Date.now() + 60_000) return { ok: false, configured: true, reason: "challenge issued in the future" };
  if (difficulty < 8 || difficulty > 26) return { ok: false, configured: true, reason: "challenge difficulty out of range" };

  const digest = createHash("sha256").update(nonce + ":" + solution).digest("hex");
  if (leadingZeroBits(digest) < difficulty) {
    return { ok: false, configured: true, reason: "proof of work is not valid" };
  }

  if (seen && (await seen(nonce))) {
    return { ok: false, configured: true, reason: "this challenge was already used" };
  }
  return { ok: true, configured: true };
}

/* ------------------------- identity plausibility ------------------------ */

/** Mailbox providers that hand out an address to anyone, instantly, with no
 *  account. Blocking them does not stop a determined attacker — it removes the
 *  cheapest possible supply of "new identities" for a free-credit grant. */
const DISPOSABLE = [
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "10minutemail.com",
  "tempmail.com", "temp-mail.org", "throwawaymail.com", "yopmail.com", "sharklasers.com",
  "trashmail.com", "getnada.com", "dispostable.com", "fakeinbox.com", "maildrop.cc",
  "mailnesia.com", "spamgourmet.com", "mytemp.email", "moakt.com", "emailondeck.com",
  "tempr.email", "discard.email", "mailcatch.com", "inboxkitten.com", "burnermail.io",
  "grr.la", "spam4.me", "tmpmail.org", "minuteinbox.com", "mohmal.com",
];

export function isDisposableEmail(email: string): boolean {
  const domain = String(email ?? "").toLowerCase().split("@").pop() || "";
  if (!domain) return false;
  return DISPOSABLE.some((d) => domain === d || domain.endsWith("." + d));
}

/** The browser-side solver, served to the page so the client never has to
 *  implement proof of work itself. Kept here so the algorithm can only ever
 *  change in one place. */
export const SOLVER_JS = `
/* JOSHRIX human-verification solver. Finds a string whose SHA-256, prefixed by
   the challenge nonce, starts with N zero bits. Costs the visitor about a
   second; costs a bulk signup farm that same second per account. */
window.joshrixSolve = async function (challenge, onProgress) {
  var enc = new TextEncoder();
  function bits(buf) {
    var v = new Uint8Array(buf), n = 0;
    for (var i = 0; i < v.length; i++) {
      if (v[i] === 0) { n += 8; continue; }
      var b = v[i], c = 0;
      while ((b & 0x80) === 0) { c++; b <<= 1; }
      return n + c;
    }
    return n;
  }
  for (var i = 0; ; i++) {
    var d = await crypto.subtle.digest("SHA-256", enc.encode(challenge.nonce + ":" + i));
    if (bits(d) >= challenge.difficulty) return String(i);
    if (onProgress && (i & 8191) === 0) onProgress(i);
  }
};`;
