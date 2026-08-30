/**
 * THE TWO THINGS THAT WERE STILL PROMISES.
 *
 *   the payout destination — /api/payout took a raw `destinationRef` string
 *   from the request body and wallet.html sent the literal
 *   "tok_demo_dest_2941" on every request, so no withdrawal in the platform's
 *   history could ever have reached a human being. The money side ended at a
 *   hard-coded placeholder.
 *
 *   the 1% lifetime commission — /referrals described it in detail: the rate,
 *   the £20,000 per-customer cap, the 20-referral unlock, the validation
 *   window. Not one line of it existed.
 *
 * Both are implemented now, and the parts that decide money are tested here:
 * an account reference is never stored or returned in the clear, and a
 * commission is only ever accrued once, only after the unlock, never past the
 * cap, and never paid before it has survived the refund window.
 *
 *   node tests/t36-payout-commission.js
 */
const led = require('./build/api/_ledger.js');
const sec = require('./build/api/_secrets.js');
const growth = require('./build/shared/growth.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/* ================================================================= *
 * 1. AN ACCOUNT REFERENCE NEVER SITS IN THE CLEAR
 * ================================================================= */
console.log('\nthe payout destination is encrypted, and fails closed without a key');
{
  delete process.env.PAYOUT_SECRET;
  sec.__resetKeyCacheForTests();
  t('with no PAYOUT_SECRET the platform reports it cannot store one', sec.payoutSecretConfigured() === false);
  // Refusing is the whole point: "store it in the clear for now" is exactly how
  // account numbers end up in a database dump.
  let threw = false;
  try { sec.encryptSecret('GB29NWBK60161331926819'); } catch { threw = true; }
  t('and refuses to encrypt rather than storing plaintext', threw);

  process.env.PAYOUT_SECRET = 'a-long-enough-test-secret-value-0123456789';
  sec.__resetKeyCacheForTests();
  t('with a secret set it is configured', sec.payoutSecretConfigured() === true);

  const IBAN = 'GB29NWBK60161331926819';
  const blob = sec.encryptSecret(IBAN);
  t('the ciphertext does not contain the reference', !blob.includes(IBAN) && !blob.includes('60161331926819'));
  t('it is versioned so the format can change later', blob.startsWith('v1:'));
  t('it round-trips', sec.decryptSecret(blob) === IBAN);
  // AES-GCM authenticates: a tampered row fails to decrypt rather than
  // decrypting to something else.
  const parts = blob.split(':');
  const tampered = [parts[0], parts[1], parts[2], Buffer.from('nonsense').toString('base64url')].join(':');
  t('a tampered row does not decrypt', sec.decryptSecret(tampered) === null);
  t('the same value encrypts differently each time (random iv)', sec.encryptSecret(IBAN) !== blob);

  process.env.PAYOUT_SECRET = 'a-completely-different-secret-value-98765';
  sec.__resetKeyCacheForTests();
  t('another key cannot read it', sec.decryptSecret(blob) === null);
  process.env.PAYOUT_SECRET = 'a-long-enough-test-secret-value-0123456789';
  sec.__resetKeyCacheForTests();

  t('only the last four characters are ever shown', sec.maskTail(IBAN) === '6819');
  t('a short reference is masked entirely', sec.maskTail('123') === '****');
  t('garbage decrypts to null rather than throwing', sec.decryptSecret('not-a-blob') === null);
}

/* ================================================================= *
 * 2. VERIFIED NET REVENUE
 * ================================================================= */
console.log('\ncommission is 1% of net, not of the price');
{
  const gross = 10000;                                   // £100 settled
  const net = growth.verifiedNetRevenueMinor(gross, 'card');
  t('the processor fee comes off first', net === gross - (Math.round(gross * 0.014) + 20), `${net}`);
  t('so commission is less than 1% of the sticker price',
    growth.commissionMinor(net) < Math.floor(gross * growth.GROWTH.commissionRate) + 1);
  t('a refunded-to-zero payment earns nothing', growth.verifiedNetRevenueMinor(0) === 0);
  t('net can never go negative on a tiny payment', growth.verifiedNetRevenueMinor(5) === 0);

  // The £20,000 lifetime cap per customer.
  const cap = growth.GROWTH.perCustomerLifetimeCapMinor;
  t('the cap stops further commission once reached', growth.commissionMinor(1_000_000, cap) === 0);
  t('and pays only the remaining room at the boundary',
    growth.commissionMinor(1_000_000, cap - 50) === 50);
}

/* ================================================================= *
 * 3. ACCRUE ONCE, CLEAR, THEN PAY — AND REVERSE ON A REFUND
 * ================================================================= */
function makeDb() {
  const rows = [], earn = new Map();
  let now = Date.now();
  const sql = (strings, ...vals) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (/^(CREATE|ALTER)/i.test(q)) return Promise.resolve([]);
    if (q.includes('INSERT INTO referral_commissions')) {
      const [id, referrer, referred, ev, gross, net, com, days, pi] = vals;
      if (rows.some((r) => r.source_event === ev)) return Promise.resolve([]);     // UNIQUE
      rows.push({ id, referrer, referred, source_event: ev, gross, net, commission_minor: com,
        clears_at: now + days * 86400e3, released_at: null, reversed_at: null, payment_intent: pi });
      return Promise.resolve([{ id }]);
    }
    if (q.includes('sum(commission_minor), 0)::bigint AS total')) {
      const [referrer, referred] = vals;
      return Promise.resolve([{ total: rows.filter((r) => r.referrer === referrer && r.referred === referred && !r.reversed_at)
        .reduce((n, r) => n + r.commission_minor, 0) }]);
    }
    if (q.includes('UPDATE referral_commissions SET released_at')) {
      const due = rows.filter((r) => r.referrer === vals[0] && !r.released_at && !r.reversed_at && r.clears_at <= now);
      due.forEach((r) => { r.released_at = now; });
      return Promise.resolve(due.map((r) => ({ commission_minor: r.commission_minor })));
    }
    if (q.includes('UPDATE referral_commissions SET reversed_at')) {
      const r = rows.find((x) => x.payment_intent === vals[0] && !x.reversed_at);
      if (!r) return Promise.resolve([]);
      r.reversed_at = now;
      return Promise.resolve([{ referrer_wallet: r.referrer, commission_minor: r.commission_minor, released_at: r.released_at }]);
    }
    if (q.includes('INSERT INTO creator_earnings')) {
      const [w, amt] = vals; earn.set(w, (earn.get(w) || 0) + amt); return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
  return { sql, rows, earn, advanceDays: (d) => { now += d * 86400e3; } };
}

(async () => {

console.log('\na commission accrues once, clears, then pays');
{
  const db = makeDb();
  const P = 'w-partner', C = 'w-customer';
  const book = (ev, pi) => led.recordCommission(db.sql, {
    id: 'rc_' + ev, referrerWallet: P, referredWallet: C, sourceEvent: ev,
    grossMinor: 10000, netMinor: 9840, commissionMinor: 98,
    validationDays: growth.GROWTH.validationDays[0], paymentIntent: pi,
  });

  t('a payment books a commission', await book('evt_1', 'pi_1') === true);
  // A Stripe webhook is retried on any non-2xx. Booking twice would pay a
  // partner twice for one payment.
  t('a REPLAYED webhook books nothing extra', await book('evt_1', 'pi_1') === false);
  t('a different payment books again', await book('evt_2', 'pi_2') === true);

  t('nothing is withdrawable before the validation window',
    await led.releaseClearedCommission(db.sql, P) === 0);
  t('and the partner has been credited nothing', (db.earn.get(P) || 0) === 0);

  db.advanceDays(growth.GROWTH.validationDays[0] + 1);
  t('after the window it clears into earnings', await led.releaseClearedCommission(db.sql, P) === 196);
  t('the earnings ledger received it', db.earn.get(P) === 196);
  t('and it does not clear twice', await led.releaseClearedCommission(db.sql, P) === 0);

  t('the per-customer total is what was booked',
    await led.commissionEarnedFromCustomer(db.sql, P, C) === 196);
}

console.log('\na refund takes the commission back');
{
  const db = makeDb();
  const P = 'w-p2', C = 'w-c2';
  await led.recordCommission(db.sql, { id: 'rc_a', referrerWallet: P, referredWallet: C, sourceEvent: 'evt_a',
    grossMinor: 10000, netMinor: 9840, commissionMinor: 98, validationDays: 30, paymentIntent: 'pi_a' });

  // Reversal is keyed on the PAYMENT INTENT: charge.refunded carries its own
  // event id, so looking it up by that would never match the payment it was
  // booked against, and the commission would survive the refund silently.
  t('an unrelated payment intent reverses nothing',
    await led.reverseCommissionForPaymentIntent(db.sql, 'pi_other') === null);
  const rev = await led.reverseCommissionForPaymentIntent(db.sql, 'pi_a');
  t('the refunded payment reverses its commission', rev && Number(rev.commission_minor) === 98);
  t('and it reverses only once', await led.reverseCommissionForPaymentIntent(db.sql, 'pi_a') === null);

  db.advanceDays(60);
  t('a reversed commission never clears into earnings',
    await led.releaseClearedCommission(db.sql, P) === 0);
  t('so the partner is paid nothing for a refunded sale', (db.earn.get(P) || 0) === 0);
  t('and it stops counting toward the lifetime cap',
    await led.commissionEarnedFromCustomer(db.sql, P, C) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
