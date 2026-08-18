/**
 * CHARGE ON ACCEPT — a creator pays only if they keep the build.
 *
 * This is the promise that decides whether a disappointed customer asks for a
 * refund or asks their bank, so every path is tested against a fake that
 * ENFORCES THE SAME WHERE-CLAUSE GUARDS as Postgres. A fake that just returns a
 * convenient value would prove nothing — that is exactly how tests/t6 reported a
 * passing dedupe for weeks while asserting nothing.
 *
 * The guards under test, each a single conditional UPDATE:
 *   accept  : only if not already accepted AND not already refunded
 *   release : only if not already refunded AND not already accepted
 *   expiry  : only undecided holds, only past the age limit
 *   wallet  : a hold can only ever be resolved by the wallet that paid it
 *
 *   node tests/t21-charge-on-accept.js      (expects ./build/_ledger.js)
 */
const L = require('./build/_ledger.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/* A fake Postgres that really stores rows and really applies the guards. */
function makeDb() {
  const charges = [];            // { id, wallet_id, amount, settle_amount, created_at, refunded_at, accepted_at }
  const wallets = new Map();     // id -> balance

  const sql = (strings, ...vals) => {
    const q = strings.join('?').replace(/\s+/g, ' ');
    const now = Date.now();

    if (q.includes('INSERT INTO forge_charges')) {
      const [id, wallet_id, amount, settle_amount] = vals;
      if (!charges.some((c) => c.id === id)) {            // ON CONFLICT DO NOTHING
        charges.push({ id, wallet_id, amount, settle_amount, created_at: now, refunded_at: null, accepted_at: null });
      }
      return Promise.resolve([]);
    }

    if (q.includes('SET accepted_at = now()')) {
      const [id, walletId] = vals;
      const r = charges.find((c) => c.id === id && c.wallet_id === walletId
        && c.accepted_at === null && c.refunded_at === null);
      if (!r) return Promise.resolve([]);
      r.accepted_at = now;
      return Promise.resolve([{ amount: r.amount, settle_amount: r.settle_amount ?? r.amount }]);
    }

    if (q.includes('SET refunded_at = now()') && q.includes('created_at <')) {   // expiry sweep
      const [walletId, hours] = vals;
      const hit = charges.filter((c) => c.wallet_id === walletId && c.refunded_at === null
        && c.accepted_at === null && c.created_at < now - hours * 3600e3);
      hit.forEach((c) => { c.refunded_at = now; });
      return Promise.resolve(hit.map((c) => ({ amount: c.amount })));
    }

    if (q.includes('SET refunded_at = now()')) {                                  // single release
      const [id, walletId] = vals;
      const r = charges.find((c) => c.id === id && c.wallet_id === walletId
        && c.refunded_at === null && c.accepted_at === null);
      if (!r) return Promise.resolve([]);
      r.refunded_at = now;
      return Promise.resolve([{ amount: r.amount }]);
    }

    if (q.includes('UPDATE wallets SET balance = balance +')) {
      const [amount, id] = vals;
      wallets.set(id, (wallets.get(id) ?? 0) + amount);
      return Promise.resolve([{ balance: wallets.get(id) }]);
    }

    throw new Error('fake db saw an unexpected query: ' + q.slice(0, 90));
  };

  return { sql, charges, wallets, age: (id, hours) => {
    charges.find((c) => c.id === id).created_at = Date.now() - hours * 3600e3 - 1000;
  } };
}

(async () => {

console.log('\n== a forge holds, it does not charge ==');
{
  const db = makeDb();
  await L.recordForgeHold(db.sql, 'f1', 'w1', 250, 51);
  const row = db.charges[0];
  t('the hold is recorded at the full held amount', row.amount === 250);
  t('what it WOULD cost is recorded separately', row.settle_amount === 51);
  t('nothing is marked paid yet', row.accepted_at === null && row.refunded_at === null);
  t('recording twice does not create a second charge',
    (await L.recordForgeHold(db.sql, 'f1', 'w1', 250, 51), db.charges.length === 1),
    'a retried forge response would double-charge');
}

console.log('\n== keeping the build collects only what it cost ==');
{
  const db = makeDb();
  await L.recordForgeHold(db.sql, 'f1', 'w1', 250, 51);
  const got = await L.acceptForgeCharge(db.sql, 'f1', 'w1');
  t('charged exactly what the run cost', got.charged === 51);
  t('the rest of the hold comes back', got.refund === 199);
  t('charge + refund equals the hold — no money invented or lost', got.charged + got.refund === 250);
  t('accepting twice pays nothing extra', (await L.acceptForgeCharge(db.sql, 'f1', 'w1')) === null,
    'a double-click on Publish must not charge twice');
  t('it cannot then be released for a full refund',
    (await L.releaseForgeHold(db.sql, 'f1', 'w1')) === null,
    'otherwise a creator publishes AND refunds — free games');
}

console.log('\n== not keeping it costs nothing at all ==');
{
  const db = makeDb();
  await L.recordForgeHold(db.sql, 'f2', 'w1', 250, 51);
  t('the entire hold is returned', (await L.releaseForgeHold(db.sql, 'f2', 'w1')) === 250,
    'this is the whole promise: an unplayable build is free');
  t('releasing twice returns nothing', (await L.releaseForgeHold(db.sql, 'f2', 'w1')) === null);
  t('a released hold can no longer be charged',
    (await L.acceptForgeCharge(db.sql, 'f2', 'w1')) === null);
}

console.log('\n== a hold belongs to the wallet that paid it ==');
{
  const db = makeDb();
  await L.recordForgeHold(db.sql, 'f3', 'w1', 250, 51);
  t('another wallet cannot release it', (await L.releaseForgeHold(db.sql, 'f3', 'w2')) === null,
    'that would credit a stranger with someone else\'s hold');
  t('another wallet cannot accept it', (await L.acceptForgeCharge(db.sql, 'f3', 'w2')) === null);
  t('the real owner still can', (await L.releaseForgeHold(db.sql, 'f3', 'w1')) === 250);
}

console.log('\n== a creator who walks away is not left short ==');
{
  const db = makeDb();
  await L.recordForgeHold(db.sql, 'old', 'w1', 250, 51);
  await L.recordForgeHold(db.sql, 'new', 'w1', 250, 51);
  db.age('old', 30);                                   // 30 hours ago
  const freed = await L.releaseExpiredForgeHolds(db.sql, 'w1', 24);
  t('the abandoned hold is returned in full', freed === 250);
  t('the balance actually receives it', db.wallets.get('w1') === 250,
    'a sweep that marks the row but never credits the wallet is worse than none');
  t('a hold taken minutes ago is untouched',
    db.charges.find((c) => c.id === 'new').refunded_at === null,
    'sweeping a live decision would refund a build the creator is still judging');
  t('sweeping again frees nothing', (await L.releaseExpiredForgeHolds(db.sql, 'w1', 24)) === 0);
}

console.log('\n== the charge can never exceed the hold ==');
{
  const db = makeDb();
  // A settle estimate above the hold must never overdraw the creator.
  await L.recordForgeHold(db.sql, 'f4', 'w1', 250, 900);
  const got = await L.acceptForgeCharge(db.sql, 'f4', 'w1');
  t('charge is clamped to the hold', got.charged === 250);
  t('refund is never negative', got.refund === 0);
  t('a creator can never be billed more than was reserved', got.charged <= 250);
}

console.log('\n== a build that failed to render is still free ==');
{
  const db = makeDb();
  await L.recordForgeHold(db.sql, 'f5', 'w1', 250, 51);
  t('the render watchdog releases the whole hold',
    (await L.claimForgeRefund(db.sql, 'f5', 'w1')) === 250);
  t('and cannot be claimed twice', (await L.claimForgeRefund(db.sql, 'f5', 'w1')) === null);
}
{
  const db = makeDb();
  await L.recordForgeHold(db.sql, 'f6', 'w1', 250, 51);
  await L.acceptForgeCharge(db.sql, 'f6', 'w1');
  t('a published build cannot then claim a render refund',
    (await L.claimForgeRefund(db.sql, 'f6', 'w1')) === null,
    'publish then claim-crash would be a free game every time');
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
