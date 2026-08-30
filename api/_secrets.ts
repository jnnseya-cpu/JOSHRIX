/**
 * Encryption at rest for the one thing on this platform that is genuinely
 * dangerous to store: a creator's payout destination.
 *
 * An IBAN, an account number or a mobile-money number is enough to attempt
 * fraud with, and it is the only field here that a database leak would turn
 * directly into somebody else's money moving. So it never touches a column in
 * plaintext.
 *
 * AES-256-GCM, which authenticates as well as encrypts: a row someone tampered
 * with fails to decrypt rather than decrypting to something else. The key comes
 * from PAYOUT_SECRET and is stretched with scrypt, so the environment variable
 * can be an ordinary long random string rather than exactly 32 bytes of hex.
 *
 * FAILS CLOSED. With no PAYOUT_SECRET set, encrypt() throws and the endpoint
 * refuses to save a destination. Storing it in the clear "for now" is precisely
 * how sensitive data ends up in a repository, and there is no version of that
 * which is worth the convenience.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const VERSION = "v1";
/** Fixed salt: the secret is already high-entropy, and a per-row salt would
 *  mean a scrypt derivation on every read of every row. The salt is not the
 *  protection here — the secret is. */
const SALT = "joshrix.payout.v1";

let cached: Buffer | null = null;

function key(): Buffer {
  if (cached) return cached;
  const secret = process.env.PAYOUT_SECRET ?? "";
  if (secret.length < 16) {
    throw new Error("PAYOUT_SECRET is not set (or is too short) — payout destinations cannot be stored safely without it.");
  }
  cached = scryptSync(secret, SALT, 32);
  return cached;
}

/** True when destinations can be stored at all. Endpoints check this so they
 *  can answer with a clear reason instead of a 500. */
export function payoutSecretConfigured(): boolean {
  return (process.env.PAYOUT_SECRET ?? "").length >= 16;
}

/** → "v1:<iv b64url>:<tag b64url>:<ciphertext b64url>" */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);                       // GCM standard nonce length
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [VERSION, iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(":");
}

/** Returns null for anything that does not decrypt cleanly — a wrong key, a
 *  truncated row, a tampered ciphertext. Never throws at the caller. */
export function decryptSecret(blob: string): string | null {
  try {
    const [v, iv, tag, data] = String(blob).split(":");
    if (v !== VERSION || !iv || !tag || !data) return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** What a creator sees instead of their own account number. Keeps the last
 *  four characters, which is enough to recognise it and useless to steal. */
export function maskTail(ref: string): string {
  const s = String(ref).replace(/\s+/g, "");
  return s.length <= 4 ? "****" : s.slice(-4);
}

/** Test hook — the key is cached per process, and a test that changes the
 *  environment needs the next call to pick it up. */
export function __resetKeyCacheForTests() { cached = null; }
