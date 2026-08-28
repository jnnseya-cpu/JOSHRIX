/**
 * Shared test rig for server-verified identity.
 *
 * Not a test — the runner only executes files matching /^t\d/, so this is
 * copied into the workspace and required by the tests that need to present a
 * valid caller.
 *
 * A real Firebase ID token cannot be minted here (that needs Google's private
 * key) and a captured one would expire, so this signs with a locally generated
 * RSA key and stubs the two things that reach outward: the cert fetch, and the
 * X509 certificate parse. Everything api/_auth.ts actually decides — the alg
 * pin, aud, iss, exp, iat, and the RSA signature verification itself — runs for
 * real against these tokens.
 */
const crypto = require('crypto');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid-1';
const RealX509 = crypto.X509Certificate;
let installed = false;

/** Redirect _auth.ts's cert lookup at our key. Idempotent. */
function install() {
  if (installed) return;
  installed = true;
  // _auth.ts does `new crypto.X509Certificate(pem).publicKey`; the property is
  // read at call time, so replacing it works even after _auth.js is required.
  // node:crypto and crypto are the same module object.
  class FakeX509 {
    constructor(pem) { if (pem !== 'STUB_CERT') throw new Error('unexpected certificate'); }
    get publicKey() { return publicKey; }
  }
  crypto.X509Certificate = FakeX509;
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => 'max-age=3600' },
    json: async () => ({ [KID]: 'STUB_CERT' }),
  });
}

function restore() {
  crypto.X509Certificate = RealX509;
  installed = false;
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * Mint a token. `claims` overrides payload fields, `opts` breaks the token on
 * purpose: {alg:'none'} strips the signature, {tamper:true} corrupts it,
 * {kid:'…'} signs with a key the server does not know.
 */
function mint(projectId, claims = {}, opts = {}) {
  install();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: opts.alg ?? 'RS256', kid: opts.kid ?? KID, typ: 'JWT' };
  const payload = Object.assign({
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: 'uid-owner', email: 'owner@example.com', email_verified: true,
    iat: now - 10, exp: now + 3600,
  }, claims);
  const input = `${b64(header)}.${b64(payload)}`;
  if (opts.alg === 'none') return `${input}.`;
  const sig = opts.tamper
    ? Buffer.from('not-a-real-signature')
    : crypto.sign('RSA-SHA256', Buffer.from(input), privateKey);
  return `${input}.${sig.toString('base64url')}`;
}

/** Ready-made Authorization header for a signed-in caller. */
function authHeader(projectId, claims = {}) {
  return { authorization: 'Bearer ' + mint(projectId, claims) };
}

module.exports = { install, restore, mint, authHeader, KID };
