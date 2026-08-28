/**
 * SERVER-VERIFIED IDENTITY.
 *
 * The hole this closes (P0, found 28 Aug): POST /api/wallet-init {email} handed
 * back that email's walletId. No password, no token, no proof of ownership — and
 * a walletId is the bearer secret for everything, including POST /api/payout,
 * which takes the wallet AND the destination from the same request body. Knowing
 * somebody's email address was enough to withdraw their earnings.
 *
 * The frontend has always signed users in with Firebase and has exposed
 * `window.jxAuth.idToken()` since it was written. The backend simply never asked
 * for it: `grep -rln firebase api/` returned nothing. So the credential now is
 * the Firebase ID token — a thing Google signed — and walletId goes back to
 * being what it should always have been, a database key that proves nothing.
 *
 * NO NEW DEPENDENCY. A Firebase ID token is an RS256 JWT; node:crypto verifies
 * it against Google's published X.509 certs. firebase-admin would pull a large
 * transitive tree into every serverless function to do the same four checks.
 */
import { createVerify, X509Certificate } from "node:crypto";
import { FIREBASE_PROJECT_ID } from "../shared/firebase";

/** Google's public signing certificates for Firebase ID tokens. */
const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

/** Clock skew tolerance. Serverless clocks drift; a user must not be logged out
 *  because a container was thirty seconds fast. */
const SKEW_SECONDS = 60;

type Certs = Record<string, string>;
let cache: { keys: Certs; expiresAt: number } | null = null;

async function googleCerts(): Promise<Certs> {
  if (cache && Date.now() < cache.expiresAt) return cache.keys;
  try {
    const res = await fetch(CERT_URL);
    if (!res.ok) throw new Error(`cert endpoint returned ${res.status}`);
    const keys = (await res.json()) as Certs;
    // Honour Google's own cache lifetime; they rotate roughly daily.
    const m = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "");
    cache = { keys, expiresAt: Date.now() + (m ? Number(m[1]) * 1000 : 3600_000) };
    return keys;
  } catch (err) {
    // A transient network failure must not log everybody out. Stale certs still
    // verify correctly — rotation is gradual and old keys stay valid for days —
    // so an expired cache is far better than refusing every request.
    if (cache) return cache.keys;
    throw err;
  }
}

const b64url = (s: string) => Buffer.from(s, "base64url");

export type VerifiedUser = { uid: string; email: string | null; emailVerified: boolean };

/**
 * Verify a Firebase ID token. Returns the user, or null for ANY failure —
 * callers must not be able to tell a forged token from an expired one.
 *
 * Checks, in the order that costs least: shape, algorithm, claims, then the
 * signature. `alg` is pinned to RS256 explicitly, because the classic JWT
 * forgery is a token that says `alg: "none"` and carries no signature at all.
 */
export async function verifyIdToken(token: string): Promise<VerifiedUser | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(b64url(parts[0]).toString("utf8"));
    if (header.alg !== "RS256" || !header.kid) return null;

    const payload = JSON.parse(b64url(parts[1]).toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    const project = FIREBASE_PROJECT_ID;
    if (!project) return null;
    // A token minted by a DIFFERENT Firebase project is signed by the same
    // Google key and would otherwise verify perfectly — `aud` is the only thing
    // separating our users from every other Firebase app in the world.
    if (payload.aud !== project) return null;
    if (payload.iss !== `https://securetoken.google.com/${project}`) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.exp !== "number" || payload.exp + SKEW_SECONDS < now) return null;
    if (typeof payload.iat !== "number" || payload.iat - SKEW_SECONDS > now) return null;

    const certs = await googleCerts();
    const pem = certs[header.kid];
    if (!pem) return null;                       // unknown signing key
    const ok = createVerify("RSA-SHA256")
      .update(`${parts[0]}.${parts[1]}`)
      .verify(new X509Certificate(pem).publicKey, b64url(parts[2]));
    if (!ok) return null;

    return {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: payload.email_verified === true,
    };
  } catch {
    return null;                                  // malformed input is a failure, not a crash
  }
}

/** Pull the bearer token off a request. Header only — never a query string,
 *  which is the mistake this whole change exists to stop repeating. */
export function bearerToken(req: any): string | null {
  const h = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/** Verify whoever is calling, or null if they presented nothing valid. */
export async function callerIdentity(req: any): Promise<VerifiedUser | null> {
  const token = bearerToken(req);
  return token ? verifyIdToken(token) : null;
}
