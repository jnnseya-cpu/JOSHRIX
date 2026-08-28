/**
 * The Firebase project that owns this platform's user identities.
 *
 * This is deliberately a CONSTANT rather than a required environment variable.
 * It is not a secret — the same value is served to every browser in
 * frontend/assets/config.js, because a Firebase web config is public by design.
 * Making it an env var would buy no security and would add a way for the site to
 * break: token verification is now on the critical path for signing in, so a
 * missing FIREBASE_PROJECT_ID in Vercel would lock every user out of their
 * wallet. A wrong constant fails loudly in tests; a missing env var fails
 * silently in production at 2am.
 *
 * The override exists for a project migration, and for tests that need to prove
 * a token from another Firebase project is rejected.
 *
 * MUST match `projectId` in frontend/assets/config.js — tests/t33-auth.js
 * asserts they are identical, because a mismatch means the server rejects every
 * token the client can possibly produce.
 */
export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "tradeconnect-tzm9l";

/** `aud` and `iss` a genuine token for this project must carry. */
export const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
