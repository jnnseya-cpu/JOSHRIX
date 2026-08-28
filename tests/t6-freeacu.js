/**
 * NO FREE AI — who is allowed to hold AI credit they did not pay for.
 *
 * The rule has exactly one carve-out: accounts WE designate as testers. That
 * carve-out is only safe if the designation cannot be self-selected, so this
 * test attacks the boundary from both sides:
 *
 *   - a public signup must be worth nothing to farm (zero credit, any address)
 *   - the tester category must be reachable only through MODERATION_KEY
 *   - a wallet that has ever PAID can never be moved back into a free category
 *
 * The fake below applies the same WHERE-clause guards as Postgres. A fake that
 * returned a convenient value would prove nothing — this file previously
 * reported "EXPLOITABLE" as a narrative rather than failing, which is why the
 * 2,000-ACU-per-signup grant survived for weeks.
 *
 *   node tests/t6-freeacu.js       (expects ./build/api/*.js)
 */
process.env.MODERATION_KEY = 'test-key-not-a-real-secret';

const led = require('./build/api/_ledger.js');
const pay = require('./build/shared/payments.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const wallets = new Map();
let now = Date.now();

const fake = (strings, ...vals) => {
  const q = strings.join('?').replace(/\s+/g, ' ').trim();

  if (/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/i.test(q)) return Promise.resolve([]);

  if (/^INSERT INTO wallets/i.test(q)) {
    const [id, bal, cat, email, name] = vals;
    if (!wallets.has(id)) wallets.set(id, { id, balance: bal, category: cat, email, name, plan: 'explorer', created_at: now, last_refill_at: null });
    return Promise.resolve([]);
  }

  if (/FROM wallets WHERE id = \?/i.test(q)) {
    const w = wallets.get(vals[0]);
    return Promise.resolve(w ? [w] : []);
  }

  // the email lookup IS the one-wallet-per-person dedupe
  if (/FROM wallets WHERE lower\(email\)/i.test(q)) {
    const want = String(vals[0] ?? '').toLowerCase();
    const hit = [...wallets.values()].find((w) => String(w.email ?? '').toLowerCase() === want);
    return Promise.resolve(hit ? [hit] : []);
  }

  if (/FROM wallets WHERE email ILIKE/i.test(q)) {
    const needle = String(vals[0] ?? '').replace(/%/g, '').toLowerCase();
    return Promise.resolve([...wallets.values()].filter((w) =>
      String(w.email ?? '').toLowerCase().includes(needle) || String(w.name ?? '').toLowerCase().includes(needle)));
  }

  // REFILL — every guard is in the WHERE clause, so model every guard
  if (/SET balance = GREATEST/i.test(q)) {
    const [to, id, ceiling, cooldown] = vals;
    const w = wallets.get(id);
    if (!w || w.category !== 'tester' || !(w.balance < ceiling)) return Promise.resolve([]);
    if (w.last_refill_at !== null && w.last_refill_at >= now - cooldown * 1000) return Promise.resolve([]);
    w.balance = Math.max(w.balance, to);
    w.last_refill_at = now;
    return Promise.resolve([{ balance: w.balance }]);
  }

  // CATEGORY — purchased is terminal
  if (/^UPDATE wallets SET category = \? WHERE id/i.test(q)) {
    const [cat, id] = vals;
    const w = wallets.get(id);
    if (!w || w.category === 'purchased') return Promise.resolve([]);
    w.category = cat;
    return Promise.resolve([{ category: w.category }]);
  }

  if (/^UPDATE wallets SET category = 'purchased'/i.test(q)) {
    const w = wallets.get(vals[0]); if (w) w.category = 'purchased';
    return Promise.resolve([]);
  }

  if (/^UPDATE wallets SET balance = balance - /i.test(q)) {
    const [cost, id] = vals; const w = wallets.get(id);
    if (w && w.balance >= cost) { w.balance -= cost; return Promise.resolve([{ balance: w.balance }]); }
    return Promise.resolve([]);
  }

  if (/^UPDATE wallets SET balance = balance \+ /i.test(q)) {
    const [amt, id] = vals; const w = wallets.get(id);
    if (w) { w.balance += amt; return Promise.resolve([{ balance: w.balance }]); }
    return Promise.resolve([]);
  }

  if (/^DELETE FROM wallets/i.test(q)) {
    const gone = wallets.delete(vals[0]);
    return Promise.resolve(gone ? [{ id: vals[0] }] : []);
  }

  return Promise.resolve([]);   // rate-limit + security-event bookkeeping
};

led.__setDbForTests(fake);
const walletInit = require('./build/api/wallet-init.js').default;
const adminWallets = require('./build/api/admin-wallets.js').default;

const mkRes = () => { const r = { code: null, body: null };
  r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; };

const post = async (h, body, headers = {}) => {
  const res = mkRes();
  await h({ method: 'POST', headers, body, query: {} }, res);
  return res;
};
const admin = (body) => post(adminWallets, body, { 'x-admin-key': process.env.MODERATION_KEY });

(async () => {

console.log('\n== a public signup is worth nothing to farm ==');
{
  wallets.clear();
  const anon = [];
  for (let i = 0; i < 10; i++) anon.push(await post(walletInit, {}));
  const funded = anon.filter((r) => Number(r.body?.balance) > 0);
  t('10 anonymous signups mint 0 ACUs of AI credit', funded.length === 0,
    `${funded.length} funded wallets appeared`);
  t('they are gated, not testers', anon.every((r) => r.body?.category === pay.DEFAULT_WALLET_CATEGORY));
  t('the gated default is not the free-refill category', pay.DEFAULT_WALLET_CATEGORY !== 'tester');

  const verified = await post(walletInit, { email: 'real.person@example.com', name: 'Real' });
  t('a VERIFIED email is funded no differently', Number(verified.body.balance) === 0,
    'this is the branch that used to hand out 2,000 ACUs');
  t('the response says how to get credit', /top up/i.test(verified.body.note || ''));
}

console.log('\n== one person, one wallet — and an email is not proof of identity ==');
{
  /* This used to assert that every variant of an address returned the SAME
     wallet id. It did — to anybody who typed the address, which was the P0:
     a walletId is the bearer secret for the account, so the "identity control"
     was handing accounts out. The rule survives, the mechanism changed: a
     variant address still cannot mint a second wallet, but reaching the first
     one now needs a signed-in caller. */
  wallets.clear();
  const first = (await post(walletInit, { email: 'alice@gmail.com' })).body.walletId;
  t('the first signup gets a wallet', !!first);

  const later = [];
  for (const e of ['alice+1@gmail.com', 'a.l.i.c.e@gmail.com', 'ALICE@gmail.com']) {
    later.push(await post(walletInit, { email: e }));
  }
  t('+tags, dots and case still create NO second wallet', wallets.size === 1,
    `${wallets.size} wallet rows exist`);
  t('and none of them returns the existing wallet id',
    later.every((r) => r.body.walletId !== first),
    'an email address must never yield the account it belongs to');
  t('each is refused as unauthenticated', later.every((r) => r.code === 401),
    later.map((r) => r.code).join(','));
}

console.log('\n== refill is refused to everyone who is not a designated tester ==');
{
  wallets.clear();
  const w = (await post(walletInit, { email: 'gated@example.com' })).body.walletId;
  const r = await post(walletInit, { walletId: w, action: 'refill' });
  t('a standard account is refused', r.code === 403);
  t('and stays at zero', wallets.get(w).balance === 0,
    'a refused refill that still credits is the whole leak');
  t('the refusal does not reveal WHY', !/tester wallets only|not a tester/i.test(r.body.error || ''),
    'distinguishable refusals turn the endpoint into a category oracle');
}

console.log('\n== the admin key is the only door to tester status ==');
{
  wallets.clear();
  const w = (await post(walletInit, { email: 'friend@example.com' })).body.walletId;

  const noKey = await post(adminWallets, { walletId: w, category: 'tester' }, {});
  t('no admin key → rejected', noKey.code === 401);
  const badKey = await post(adminWallets, { walletId: w, category: 'tester' }, { 'x-admin-key': 'guess' });
  t('wrong admin key → rejected', badKey.code === 401);
  t('still not a tester after both attempts', wallets.get(w).category === 'standard');

  const bad = await admin({ walletId: w, category: 'purchased' });
  t('an admin cannot hand-set "purchased"', bad.code === 400,
    'that is Stripe settlement\'s to set — faking it would fake a payment');
  const bogus = await admin({ walletId: w, category: 'vip' });
  t('an unknown category is refused', bogus.code === 400);

  const ok = await admin({ walletId: w, category: 'tester' });
  t('with the key, designation works', ok.code === 200 && ok.body.category === 'tester');
  t('designation moves no money', wallets.get(w).balance === 0);
}

console.log('\n== a designated tester is funded generously, and only upwards ==');
{
  const w = [...wallets.values()].find((x) => x.category === 'tester').id;
  const r = await post(walletInit, { walletId: w, action: 'refill' });
  t('refill tops up to the ceiling', r.code === 200 && r.body.balance === pay.TESTER_CEILING_ACU);
  t('the ceiling is enough to actually test',
    pay.TESTER_CEILING_ACU >= 20 * 250,
    'a tester who runs out mid-session cannot finish a test');

  const again = await post(walletInit, { walletId: w, action: 'refill' });
  t('an immediate second refill is refused', again.code === 403, 'anti-runaway cooldown');

  now += (pay.TESTER_REFILL_COOLDOWN_SECONDS + 1) * 1000;
  const atCeiling = await post(walletInit, { walletId: w, action: 'refill' });
  t('a tester already at the ceiling is refused', atCeiling.code === 403);

  wallets.get(w).balance = pay.TESTER_CEILING_ACU + 5_000;   // e.g. an admin grant on top
  const noLower = await post(walletInit, { walletId: w, action: 'refill' });
  t('refill never LOWERS a balance', noLower.code === 403 && wallets.get(w).balance === pay.TESTER_CEILING_ACU + 5_000);

  wallets.get(w).balance = 10;
  const rescue = await post(walletInit, { walletId: w, action: 'refill' });
  t('a drained tester is topped straight back up', rescue.code === 200 && rescue.body.balance === pay.TESTER_CEILING_ACU);
}

console.log('\n== paying for ACUs is terminal — no route back to free ==');
{
  wallets.clear();
  const w = (await post(walletInit, { email: 'customer@example.com' })).body.walletId;
  await led.markWalletPurchased(fake, w);

  t('setWalletCategory refuses a purchased wallet',
    (await led.setWalletCategory(fake, w, 'tester')) === null);
  const viaApi = await admin({ walletId: w, category: 'tester' });
  t('the admin endpoint refuses it too', viaApi.code === 409);
  t('the customer is still "purchased"', wallets.get(w).category === 'purchased');

  const r = await post(walletInit, { walletId: w, action: 'refill' });
  t('a purchased wallet can never refill', r.code === 403);
}

console.log('\n== closing an account ==');
{
  wallets.clear();
  const a = (await post(walletInit, { email: 'leaving@example.com' })).body.walletId;
  const d1 = await post(walletInit, { walletId: a, action: 'delete' });
  t('a gated account can delete itself', d1.code === 200 && d1.body.deleted === true,
    'a public account that cannot self-delete is a data-protection problem');

  const b = (await post(walletInit, { email: 'paid@example.com' })).body.walletId;
  await led.markWalletPurchased(fake, b);
  const d2 = await post(walletInit, { walletId: b, action: 'delete' });
  t('a purchased account routes through support', d2.code === 403,
    'deleting it would silently forfeit a balance owed a refund');
  t('and is still there', wallets.has(b));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
