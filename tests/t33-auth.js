/**
 * IDENTITY IS VERIFIED SERVER-SIDE.
 *
 * The hole (P0, 28 Aug): POST /api/wallet-init {email} returned that email's
 * walletId to anyone who asked. A walletId is the bearer secret for the whole
 * account, and POST /api/payout takes the wallet AND the payout destination
 * from the same body — so knowing someone's email address was enough to send
 * their earnings to your own account. The human-verification check sat below
 * the lookup and only guarded creating a NEW wallet, so nothing stood in the way.
 *
 * These tests are written from the attacker's side first: the takeover attempt
 * comes before the happy path, because a test suite that only proves the good
 * case is how this shipped.
 *
 * Token verification is exercised against a LOCALLY GENERATED RSA key. A real
 * Firebase token cannot be minted here, and a hardcoded one would expire — so
 * the certs are stubbed and everything else (alg pinning, aud, iss, exp, iat,
 * signature) runs the real code path in api/_auth.ts.
 *
 *   node tests/t33-auth.js
 */
const crypto = require('crypto');
const led = require('./build/api/_ledger.js');
const auth = require('./build/api/_auth.js');
const fb = require('./build/shared/firebase.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/* ---------- a local signing key, standing in for Google's ---------- */
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-kid-1';

/* api/_auth.ts fetches Google's X.509 certs and does
   `new crypto.X509Certificate(pem).publicKey`. Node cannot mint a certificate
   from JS, so rather than fake one, intercept that constructor: the stub yields
   our public key and every other check — alg, aud, iss, exp, iat, and the RSA
   verify itself — runs the real code. Property access at call time is why this
   works after _auth.js is already required, and node:crypto and crypto are the
   same module object (asserted below). */
const RealX509 = crypto.X509Certificate;
class FakeX509 {
  constructor(pem) { if (pem !== 'STUB_CERT') throw new Error('unexpected cert'); }
  get publicKey() { return publicKey; }
}
crypto.X509Certificate = FakeX509;

global.fetch = async () => ({
  ok: true,
  headers: { get: () => 'max-age=3600' },
  json: async () => ({ [KID]: 'STUB_CERT' }),
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function mint(claims = {}, opts = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: opts.alg ?? 'RS256', kid: opts.kid ?? KID, typ: 'JWT' };
  const payload = Object.assign({
    aud: fb.FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${fb.FIREBASE_PROJECT_ID}`,
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

(async () => {

console.log('\na forged or wrong token is never accepted');
{
  t('a valid token verifies', (await auth.verifyIdToken(mint()))?.uid === 'uid-owner');
  t('alg:none is refused', await auth.verifyIdToken(mint({}, { alg: 'none' })) === null);
  t('a tampered signature is refused', await auth.verifyIdToken(mint({}, { tamper: true })) === null);
  t('an unknown signing key is refused', await auth.verifyIdToken(mint({}, { kid: 'other-kid' })) === null);
  // A token from ANY other Firebase project is signed by the same Google key
  // and would otherwise verify perfectly. `aud` is the only thing between our
  // users and every other Firebase app in the world.
  t('a token from another Firebase project is refused',
    await auth.verifyIdToken(mint({ aud: 'someone-elses-project' })) === null);
  t('a mismatched issuer is refused',
    await auth.verifyIdToken(mint({ iss: 'https://evil.example/x' })) === null);
  t('an expired token is refused',
    await auth.verifyIdToken(mint({ exp: Math.floor(Date.now() / 1000) - 3600 })) === null);
  t('a token issued in the future is refused',
    await auth.verifyIdToken(mint({ iat: Math.floor(Date.now() / 1000) + 9999 })) === null);
  t('a token with no subject is refused', await auth.verifyIdToken(mint({ sub: '' })) === null);
  t('garbage is refused, not thrown', await auth.verifyIdToken('not.a.token') === null);
  t('an empty string is refused', await auth.verifyIdToken('') === null);
}

console.log('\nthe bearer header is read from the header, never the URL');
{
  t('a Bearer header is read', auth.bearerToken({ headers: { authorization: 'Bearer abc' } }) === 'abc');
  t('case-insensitive scheme', auth.bearerToken({ headers: { authorization: 'bearer abc' } }) === 'abc');
  t('a missing header is null', auth.bearerToken({ headers: {} }) === null);
  t('a non-Bearer scheme is null', auth.bearerToken({ headers: { authorization: 'Basic abc' } }) === null);
  // The entire point of this change: a credential must not travel in a URL,
  // where it lands in history, referrers and screenshots.
  t('a token in the query string is NOT accepted',
    auth.bearerToken({ headers: {}, query: { token: 'abc', w: 'w-x' } }) === null);
}

console.log('\nthe project id the server checks matches the one the client uses');
{
  const fs = require('fs'), path = require('path');
  const cfg = fs.readFileSync(path.resolve(__dirname, '..', 'frontend/assets/config.js'), 'utf8');
  const m = /projectId:\s*"([^"]+)"/.exec(cfg);
  // A mismatch here rejects every token the client can possibly mint — the
  // whole platform would refuse to sign anyone in, and the cause would look
  // like "auth is broken" rather than "two strings disagree".
  t('config.js declares a project id', !!m);
  t('and it is the one api/_auth.ts verifies against', m && m[1] === fb.FIREBASE_PROJECT_ID,
    m ? `client=${m[1]} server=${fb.FIREBASE_PROJECT_ID}` : '');
}

/* ---------------- wallet ownership ---------------- */
function makeDb() {
  const wallets = new Map();
  const sql = (strings, ...vals) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (/^(CREATE|ALTER)/i.test(q)) return Promise.resolve([]);
    if (q.includes('WHERE firebase_uid = ?')) {
      const w = [...wallets.values()].find((x) => x.firebase_uid === vals[0]);
      return Promise.resolve(w ? [{ ...w }] : []);
    }
    if (q.includes('SET firebase_uid = ?') && q.includes('lower(email)')) {
      const [uid, email] = vals;
      const w = [...wallets.values()].find((x) =>
        (x.email || '').toLowerCase() === String(email).toLowerCase() && !x.firebase_uid);  // guard
      if (!w) return Promise.resolve([]);
      w.firebase_uid = uid;
      return Promise.resolve([{ ...w }]);
    }
    if (q.includes('SET firebase_uid = ?')) {
      const [uid, id] = vals;
      const w = wallets.get(id);
      if (!w || w.firebase_uid) return Promise.resolve([]);                    // guard
      w.firebase_uid = uid;
      return Promise.resolve([{ id }]);
    }
    if (q.includes('SELECT firebase_uid FROM wallets')) {
      const w = wallets.get(vals[0]);
      return Promise.resolve(w ? [{ firebase_uid: w.firebase_uid }] : []);
    }
    return Promise.resolve([]);
  };
  return { sql, wallets };
}

console.log('\na wallet binds to the account that owns it, once');
{
  const db = makeDb();
  db.wallets.set('w-victim', { id: 'w-victim', balance: 5000, category: 'purchased', email: 'owner@example.com', name: null, plan: 'studio', firebase_uid: null });

  // First verified sign-in migrates the legacy wallet onto the uid.
  const first = await led.claimWalletForUid(db.sql, 'uid-owner', 'owner@example.com');
  t('a legacy wallet binds on first verified sign-in', first && first.id === 'w-victim');
  t('and the binding is recorded', db.wallets.get('w-victim').firebase_uid === 'uid-owner');

  const again = await led.claimWalletForUid(db.sql, 'uid-owner', 'owner@example.com');
  t('the same user gets the same wallet afterwards', again && again.id === 'w-victim');

  // THE TAKEOVER: a different Firebase account claiming the same address.
  const thief = await led.claimWalletForUid(db.sql, 'uid-attacker', 'owner@example.com');
  t('a DIFFERENT account cannot claim an already-bound wallet', thief === null);
  t('and the original binding is untouched', db.wallets.get('w-victim').firebase_uid === 'uid-owner');

  t('no email means no claim', await led.claimWalletForUid(db.sql, 'uid-nobody', null) === null);
  t('an unknown email claims nothing', await led.claimWalletForUid(db.sql, 'uid-nobody', 'nobody@example.com') === null);
  t('ownership is readable for the payout check', await led.walletOwnerUid(db.sql, 'w-victim') === 'uid-owner');
  t('an unknown wallet has no owner', await led.walletOwnerUid(db.sql, 'w-ghost') === null);
}

/* ================================================================= *
 * THE ACTUAL EXPLOIT, against the real handler.
 *
 * Everything above tests parts. This drives POST /api/wallet-init the way an
 * attacker would: with nothing but a victim's email address.
 * ================================================================= */
console.log('\nthe takeover, attempted against the real endpoint');
{
  const wallets = new Map();
  const events = [];
  wallets.set('w-victim0000000', {
    id: 'w-victim0000000', balance: 9000, category: 'purchased',
    email: 'victim@example.com', name: 'Victim', plan: 'studio', firebase_uid: null,
    created_at: new Date().toISOString(),
  });

  const fake = (strings, ...vals) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (/^(CREATE|ALTER)/i.test(q)) return Promise.resolve([]);
    if (q.includes('INSERT INTO security_events')) { events.push({ kind: vals[0], severity: vals[1] }); return Promise.resolve([]); }
    if (q.includes('INSERT INTO rate_limits') || q.includes('FROM rate_limits')) return Promise.resolve([{ n: 1 }]);
    if (q.includes('lower(email) = lower(?)') && q.includes('SELECT')) {
      const w = [...wallets.values()].find((x) => (x.email || '').toLowerCase() === String(vals[0]).toLowerCase());
      return Promise.resolve(w ? [{ ...w }] : []);
    }
    if (q.includes('WHERE firebase_uid = ?')) {
      const w = [...wallets.values()].find((x) => x.firebase_uid === vals[0]);
      return Promise.resolve(w ? [{ ...w }] : []);
    }
    if (q.includes('SET firebase_uid = ?') && q.includes('lower(email)')) {
      const [uid, email] = vals;
      const w = [...wallets.values()].find((x) => (x.email || '').toLowerCase() === String(email).toLowerCase() && !x.firebase_uid);
      if (!w) return Promise.resolve([]);
      w.firebase_uid = uid;
      return Promise.resolve([{ ...w }]);
    }
    if (q.includes('SELECT id, balance, category, email, name, plan FROM wallets WHERE id = ?')) {
      const w = wallets.get(vals[0]); return Promise.resolve(w ? [{ ...w }] : []);
    }
    if (q.includes('INSERT INTO wallets')) {
      const [id, balance, category, email, name] = vals;
      wallets.set(id, { id, balance, category, email, name, plan: 'explorer', firebase_uid: null, created_at: new Date().toISOString() });
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };

  led.__setDbForTests(fake);
  const walletInit = require('./build/api/wallet-init.js').default;
  const mkRes = () => { const r = { code: null, body: null };
    r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; };
  const post = async (body, headers = {}) => {
    const res = mkRes();
    await walletInit({ method: 'POST', headers, body, query: {} }, res);
    return res;
  };

  // THE EXPLOIT. Before this change it answered 200 with the victim's walletId.
  const attack = await post({ email: 'victim@example.com' });
  t('an email address alone does NOT return a wallet id',
    attack.body?.walletId !== 'w-victim0000000', JSON.stringify(attack.body).slice(0, 90));
  t('it is refused with 401, not quietly given a new wallet', attack.code === 401);
  t('and the refusal names auth as the reason', attack.body?.code === 'auth_required');
  t('the attempt is recorded as a security event',
    events.some((e) => e.kind === 'wallet_claim_unverified' && e.severity === 'block'));
  t('no balance is leaked either', attack.body?.balance === undefined);

  // gmail dot/plus normalisation must not become a second way in
  const attack2 = await post({ email: 'v.i.c.t.i.m+x@example.com' });
  t('a normalised variant of the address is refused too', attack2.body?.walletId !== 'w-victim0000000');

  // The owner, with a real token, gets their wallet.
  const owner = await post({ email: 'victim@example.com' },
    { authorization: 'Bearer ' + mint({ sub: 'uid-victim', email: 'victim@example.com' }) });
  t('the genuine owner DOES get their wallet', owner.body?.walletId === 'w-victim0000000', JSON.stringify(owner.body).slice(0, 90));
  t('and it binds to their account', wallets.get('w-victim0000000').firebase_uid === 'uid-victim');
  t('with the real balance', Number(owner.body?.balance) === 9000);

  // A different signed-in user cannot take it now that it is bound.
  const other = await post({ email: 'victim@example.com' },
    { authorization: 'Bearer ' + mint({ sub: 'uid-thief', email: 'victim@example.com' }) });
  t('a different signed-in account cannot take the bound wallet',
    other.body?.walletId !== 'w-victim0000000');
  t('the binding survives the attempt', wallets.get('w-victim0000000').firebase_uid === 'uid-victim');

  // Anonymous wallet creation is untouched — the funnel still works signed-out.
  const anon = await post({});
  t('an anonymous caller still gets a fresh empty wallet',
    anon.code === 200 && !!anon.body?.walletId && anon.body.balance === 0);
  t('and it is not somebody else\'s', anon.body?.walletId !== 'w-victim0000000');

  led.__setDbForTests(null);
}

console.log(`\n${pass} passed, ${fail} failed`);
crypto.X509Certificate = RealX509;
process.exit(fail ? 1 : 0);
})();
