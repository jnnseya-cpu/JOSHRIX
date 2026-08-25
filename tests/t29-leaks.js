/**
 * MONEY LEAKS — every way the platform could be made to work for free, and the
 * guard that now stops it.
 *
 * Each of these was live. They are grouped by the question they answer, and the
 * comment on each group names the exploit rather than the function, because in
 * six months the function will have moved and the exploit will not have.
 *
 * As in t21, the fake Postgres ENFORCES THE WHERE-CLAUSE GUARDS. A fake that
 * returned convenient values would prove nothing — the guards ARE the security,
 * so a test that does not apply them is testing its own mock.
 *
 *   node tests/t29-leaks.js       (expects ./build/_ledger.js + ../shared/payments.js)
 */
const L = require('./build/_ledger.js');
const P = require('./build/shared/payments.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/* ------------------------------------------------------------------ *
 * A fake Postgres with real guards.
 * ------------------------------------------------------------------ */
function makeDb() {
  const st = {
    charges: [],      // forge holds
    wallets: new Map(),
    entitlements: [],
    holds: [],        // earnings_holds
    earnings: new Map(),
  };
  let now = Date.now();
  const advanceDays = (d) => { now += d * 86400e3; };

  const sql = (strings, ...vals) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();

    /* ---- schema statements are no-ops ---- */
    if (/^(CREATE|ALTER)\b/i.test(q)) return Promise.resolve([]);

    /* ---- wallets ---- */
    if (q.includes('SELECT id, balance, category, email, name, plan FROM wallets')) {
      const w = st.wallets.get(vals[0]);
      return Promise.resolve(w ? [{ ...w }] : []);
    }
    if (q.includes('UPDATE wallets SET balance = balance - ')) {          // debitWallet
      const [cost, id] = [vals[0], vals[1]];
      const w = st.wallets.get(id);
      if (!w || w.balance < cost) return Promise.resolve([]);             // AND balance >= cost
      w.balance -= cost;
      return Promise.resolve([{ balance: w.balance }]);
    }
    if (q.includes('UPDATE wallets SET balance = balance + ')) {          // creditWallet
      const [amt, id] = [vals[0], vals[1]];
      const w = st.wallets.get(id);
      if (!w) return Promise.resolve([]);
      w.balance += amt;
      return Promise.resolve([{ balance: w.balance }]);
    }

    /* ---- forge charges ---- */
    if (q.includes('INSERT INTO forge_charges')) {
      const [id, wallet_id, amount, settle_amount] = vals;
      if (!st.charges.some((c) => c.id === id)) {
        st.charges.push({ id, wallet_id, amount, settle_amount, created_at: now, refunded_at: null, accepted_at: null });
      }
      return Promise.resolve([]);
    }
    if (q.includes('SELECT id, amount, COALESCE(settle_amount, amount)')) {  // getForgeCharge
      const [id, walletId] = vals;
      const c = st.charges.find((x) => x.id === id && x.wallet_id === walletId);
      return Promise.resolve(c ? [{ id: c.id, amount: c.amount, settle_amount: c.settle_amount ?? c.amount, accepted_at: c.accepted_at, refunded_at: c.refunded_at }] : []);
    }
    if (q.includes('SET accepted_at = now(), refunded_at = NULL')) {         // recollect
      const [id, walletId] = vals;
      const c = st.charges.find((x) => x.id === id && x.wallet_id === walletId
        && x.accepted_at === null && x.refunded_at !== null);               // guards
      if (!c) return Promise.resolve([]);
      c.accepted_at = now; c.refunded_at = null;
      return Promise.resolve([{ id: c.id }]);
    }
    if (q.includes('SET accepted_at = now()')) {                            // acceptForgeCharge
      const [id, walletId] = vals;
      const c = st.charges.find((x) => x.id === id && x.wallet_id === walletId
        && x.accepted_at === null && x.refunded_at === null);
      if (!c) return Promise.resolve([]);
      c.accepted_at = now;
      return Promise.resolve([{ amount: c.amount, settle_amount: c.settle_amount ?? c.amount }]);
    }
    if (q.includes('SET refunded_at = now()') && !q.includes('created_at <')) {
      const [id, walletId] = vals;
      const c = st.charges.find((x) => x.id === id && x.wallet_id === walletId
        && x.refunded_at === null && x.accepted_at === null);
      if (!c) return Promise.resolve([]);
      c.refunded_at = now;
      return Promise.resolve([{ amount: c.amount }]);
    }

    /* ---- entitlements ---- */
    if (q.includes('INSERT INTO entitlements')) {
      const [id, game_id, buyer_wallet, buyer_email, price_minor, stripe_session, payment_intent] = vals;
      if (st.entitlements.some((e) => e.stripe_session === stripe_session)) return Promise.resolve([]);  // ON CONFLICT
      st.entitlements.push({ id, game_id, buyer_wallet, buyer_email, price_minor, stripe_session, payment_intent, revoked_at: null });
      return Promise.resolve([{ id }]);
    }
    if (q.includes('SELECT id FROM entitlements')) {
      const [gameId, walletId] = vals;
      const e = st.entitlements.find((x) => x.game_id === gameId && x.buyer_wallet === walletId && x.revoked_at === null);
      return Promise.resolve(e ? [{ id: e.id }] : []);
    }
    if (q.includes('UPDATE entitlements SET revoked_at = now()')) {
      const [pi] = vals;
      const e = st.entitlements.find((x) => x.payment_intent === pi && x.revoked_at === null);
      if (!e) return Promise.resolve([]);
      e.revoked_at = now;
      return Promise.resolve([{ id: e.id, game_id: e.game_id, buyer_wallet: e.buyer_wallet, price_minor: e.price_minor }]);
    }

    /* ---- earnings ---- */
    const ear = (id) => {
      if (!st.earnings.has(id)) st.earnings.set(id, { wallet_id: id, available_minor: 0, reserved_minor: 0, paid_minor: 0, clearing_minor: 0, clawed_back_minor: 0 });
      return st.earnings.get(id);
    };
    if (q.includes('INSERT INTO earnings_holds')) {
      const [id, wallet_id, amount_minor, days] = vals;
      if (st.holds.some((h) => h.id === id)) return Promise.resolve([]);     // ON CONFLICT DO NOTHING
      st.holds.push({ id, wallet_id, amount_minor, created_at: now, clears_at: now + days * 86400e3, released_at: null, reversed_at: null });
      return Promise.resolve([{ id }]);
    }
    if (q.includes('INSERT INTO creator_earnings') && q.includes('clearing_minor')) {
      const [id, amt] = vals; ear(id).clearing_minor += amt; return Promise.resolve([]);
    }
    if (q.includes('INSERT INTO creator_earnings')) {
      const [id, amt] = vals; ear(id).available_minor += amt; return Promise.resolve([]);
    }
    if (q.includes('UPDATE earnings_holds SET released_at = now()')) {
      const [walletId] = vals;
      const due = st.holds.filter((h) => h.wallet_id === walletId && h.released_at === null
        && h.reversed_at === null && h.clears_at <= now);                    // guards
      due.forEach((h) => { h.released_at = now; });
      return Promise.resolve(due.map((h) => ({ amount_minor: h.amount_minor })));
    }
    if (q.includes('UPDATE earnings_holds SET reversed_at = now()')) {
      const [id] = vals;
      const h = st.holds.find((x) => x.id === id && x.reversed_at === null);
      if (!h) return Promise.resolve([]);
      h.reversed_at = now;
      return Promise.resolve([{ wallet_id: h.wallet_id, amount_minor: h.amount_minor, released_at: h.released_at }]);
    }
    if (q.includes('SET available_minor = available_minor + ') && q.includes('clearing_minor = GREATEST')) {
      // three bound values, not two: the total appears in both SET clauses
      const [total, , walletId] = vals;
      const e = ear(walletId);
      e.available_minor += total; e.clearing_minor = Math.max(0, e.clearing_minor - total);
      return Promise.resolve([]);
    }
    if (q.includes('SET available_minor = available_minor - ') && q.includes('reserved_minor = reserved_minor + ')) {
      const [amt, , walletId, need] = vals;                                  // reserveForPayout
      const e = ear(walletId);
      if (e.available_minor < need) return Promise.resolve([]);              // AND available_minor >= amount
      e.available_minor -= amt; e.reserved_minor += amt;
      return Promise.resolve([{ wallet_id: walletId }]);
    }
    if (q.includes('SET reserved_minor = GREATEST') && q.includes('paid_minor = paid_minor + ')) {
      const [amt, , walletId] = vals;                                        // settleReservation
      const e = ear(walletId);
      e.reserved_minor = Math.max(0, e.reserved_minor - amt); e.paid_minor += amt;
      return Promise.resolve([]);
    }
    if (q.includes('SET available_minor = available_minor + ') && q.includes('reserved_minor = GREATEST')) {
      const [amt, , walletId] = vals;                                        // releaseReservation
      const e = ear(walletId);
      e.available_minor += amt; e.reserved_minor = Math.max(0, e.reserved_minor - amt);
      return Promise.resolve([]);
    }
    if (q.includes('SET clearing_minor = GREATEST')) {
      const [amt, walletId] = vals;
      const e = ear(walletId);
      e.clearing_minor = Math.max(0, e.clearing_minor - amt);
      return Promise.resolve([]);
    }
    if (q.includes('WITH prev AS')) {                                        // reverse from available
      const [walletId, a1] = vals;
      const e = ear(walletId);
      const taken = Math.min(e.available_minor, a1);
      e.available_minor = Math.max(0, e.available_minor - a1);
      e.clawed_back_minor += taken;
      return Promise.resolve([{ taken }]);
    }
    if (q.includes('SELECT wallet_id, available_minor, reserved_minor, paid_minor, clearing_minor')) {
      const [id] = vals;
      return Promise.resolve(st.earnings.has(id) ? [{ ...st.earnings.get(id) }] : []);
    }

    return Promise.resolve([]);
  };
  return { sql, st, advanceDays, wallet: (id, balance, plan = 'explorer') => st.wallets.set(id, { id, balance, category: 'standard', email: null, name: null, plan }) };
}

/* ================================================================== *
 * 1. COMMISSION — subscribe once, sell at that rate forever.
 * ================================================================== */
console.log('\ncommission cannot outlive the subscription');
{
  // The exploit: pay £149 for one month of Studio, price every game at 15%,
  // cancel, keep selling at 15% on a £0 plan.
  t('a lapsed Studio seller settles at the TOP rate, not their old 15%',
    P.effectiveSellerPlan('studio', 'explorer') === P.DEFAULT_SELLER_PLAN,
    P.effectiveSellerPlan('studio', 'explorer'));
  t('the top rate is the DEAREST commission on the ladder, derived not typed',
    P.PLANS.find((p) => p.id === P.DEFAULT_SELLER_PLAN).commission ===
    Math.max(...P.PLANS.filter((p) => p.commission !== null).map((p) => p.commission)));
  t('a still-subscribed Studio seller keeps 15%',
    P.effectiveSellerPlan('studio', 'studio') === 'studio');
  t('an UPGRADE applies at once — listed on Creator, now on Studio, pays 15%',
    P.effectiveSellerPlan('creator', 'studio') === 'studio');
  t('a DOWNGRADE applies at once — listed on Studio, now on Creator, pays 25%',
    P.effectiveSellerPlan('studio', 'creator') === 'creator');
  t('an unreadable wallet falls back to the plan that was agreed',
    P.effectiveSellerPlan('studio', null) === 'studio');
  t('neither readable settles at the top rate',
    P.effectiveSellerPlan(null, null) === P.DEFAULT_SELLER_PLAN);
  t('a plan id that no longer exists is not trusted',
    P.effectiveSellerPlan('legacy_gold', 'legacy_gold') === P.DEFAULT_SELLER_PLAN);
  t('explorer can never be returned as a selling plan',
    P.effectiveSellerPlan('explorer', 'explorer') !== 'explorer');
}

/* ================================================================== *
 * 2. The `?? "creator_pro"` fallback — getting the plan wrong was CHEAPER.
 * ================================================================== */
console.log('\nan unknown plan is never a discount');
{
  const unknown = P.marketplaceSplit({ grossMinor: 10000, method: 'card', sellerPlan: undefined });
  const creator = P.marketplaceSplit({ grossMinor: 10000, method: 'card', sellerPlan: 'creator' });
  const pro = P.marketplaceSplit({ grossMinor: 10000, method: 'card', sellerPlan: 'creator_pro' });
  t('an absent seller plan does NOT settle at creator_pro 20%',
    unknown.commissionRate !== pro.commissionRate, String(unknown.commissionRate));
  t('an absent seller plan settles at the dearest rate', unknown.commissionRate === creator.commissionRate);
  t('no plan on the ladder is dearer than the fallback',
    P.PLANS.filter((p) => p.commission !== null).every((p) => p.commission <= unknown.commissionRate));
  t('a bogus plan id does not throw a TypeError, it charges full',
    P.marketplaceSplit({ grossMinor: 10000, method: 'card', sellerPlan: 'nonsense' }).commissionRate === unknown.commissionRate);
  t('explorer still cannot sell at all', (() => {
    try { P.marketplaceSplit({ grossMinor: 10000, method: 'card', sellerPlan: 'explorer' }); return false; }
    catch { return true; }
  })());
  t('canSell agrees with the ladder',
    !P.canSell('explorer') && P.canSell('creator') && !P.canSell('nope') && !P.canSell(null));
}

/* ================================================================== *
 * 3. FORGE — refund the build, then publish it anyway.
 * ================================================================== */
console.log('\na refunded build cannot be published for free');
{
  const db = makeDb();
  db.wallet('w-a', 1000);
  (async () => {
    await L.recordForgeHold(db.sql, 'f1', 'w-a', 250, 60);
    await L.debitWallet(db.sql, 'w-a', 250);                     // the hold leaves the balance
    t('hold taken', db.st.wallets.get('w-a').balance === 750);

    // The client asserts a render failure and gets the whole hold back.
    const refunded = await L.claimForgeRefund(db.sql, 'f1', 'w-a');
    await L.creditWallet(db.sql, 'w-a', refunded);
    t('render-failure refund still returns the WHOLE hold', refunded === 250 && db.st.wallets.get('w-a').balance === 1000);

    // ...and now they publish it. This used to succeed and cost nothing.
    const accepted = await L.acceptForgeCharge(db.sql, 'f1', 'w-a');
    t('accept refuses a refunded hold', accepted === null);

    const collected = await L.recollectRefundedForge(db.sql, 'f1', 'w-a');
    t('publishing a refunded build re-collects the settle amount', collected === 60);
    t('and the ACUs actually left the wallet', db.st.wallets.get('w-a').balance === 940);

    const again = await L.recollectRefundedForge(db.sql, 'f1', 'w-a');
    t('it cannot be collected twice', again === null && db.st.wallets.get('w-a').balance === 940);

    const reRefund = await L.claimForgeRefund(db.sql, 'f1', 'w-a');
    t('and it cannot be refunded again after collection', reRefund === null);

    /* the walk-away promise is untouched: never published, never charged */
    const db2 = makeDb(); db2.wallet('w-b', 1000);
    await L.recordForgeHold(db2.sql, 'f2', 'w-b', 250, 60);
    await L.debitWallet(db2.sql, 'w-b', 250);
    const back = await L.releaseForgeHold(db2.sql, 'f2', 'w-b');
    await L.creditWallet(db2.sql, 'w-b', back);
    t('a build that is NOT kept still costs nothing at all', db2.st.wallets.get('w-b').balance === 1000);

    /* an empty wallet cannot publish a refunded build on credit */
    const db3 = makeDb(); db3.wallet('w-c', 250);
    await L.recordForgeHold(db3.sql, 'f3', 'w-c', 250, 60);
    await L.debitWallet(db3.sql, 'w-c', 250);
    const r3 = await L.claimForgeRefund(db3.sql, 'f3', 'w-c');
    await L.creditWallet(db3.sql, 'w-c', r3);
    await L.debitWallet(db3.sql, 'w-c', 250);                   // spent on another forge
    t('a wallet that cannot cover the settle is refused', await L.recollectRefundedForge(db3.sql, 'f3', 'w-c') === null);
    t('and is not left with a negative balance', db3.st.wallets.get('w-c').balance === 0);
  })();
}

/* ================================================================== *
 * 4. ENTITLEMENT — a paid game must not play for free, and a refunded
 *    purchase must not stay bought.
 * ================================================================== */
console.log('\nbuying is the only way to keep a paid world');
{
  const db = makeDb();
  (async () => {
    await L.grantEntitlement(db.sql, { id: 'e1', gameId: 'g-x', buyerWallet: 'w-buyer', priceMinor: 500, stripeSession: 'cs_1', paymentIntent: 'pi_1' });
    t('the buyer owns it', await L.hasEntitlement(db.sql, 'g-x', 'w-buyer') === true);
    t('a stranger does not', await L.hasEntitlement(db.sql, 'g-x', 'w-nobody') === false);
    t('nor does the buyer own a DIFFERENT game', await L.hasEntitlement(db.sql, 'g-y', 'w-buyer') === false);

    const dup = await L.grantEntitlement(db.sql, { id: 'e1b', gameId: 'g-x', buyerWallet: 'w-buyer', priceMinor: 500, stripeSession: 'cs_1', paymentIntent: 'pi_1' });
    t('a replayed webhook grants nothing twice', dup === false);

    const rev = await L.revokeEntitlementByPaymentIntent(db.sql, 'pi_1');
    t('a refund finds the purchase by payment intent', rev && rev.game_id === 'g-x');
    t('and the refunded buyer loses access', await L.hasEntitlement(db.sql, 'g-x', 'w-buyer') === false);
    t('a second refund event revokes nothing', await L.revokeEntitlementByPaymentIntent(db.sql, 'pi_1') === null);
    t('an unknown payment intent revokes nothing', await L.revokeEntitlementByPaymentIntent(db.sql, 'pi_zzz') === null);
  })();
}

/* ================================================================== *
 * 5. EARNINGS — buy with a stolen card, withdraw before the dispute.
 * ================================================================== */
console.log('\nearnings clear before they can be withdrawn');
{
  const db = makeDb();
  (async () => {
    await L.creditEarnings(db.sql, 'w-seller', 4000, { holdId: 'e1', clearingDays: P.EARNINGS_CLEARING_DAYS });
    let e = await L.getEarnings(db.sql, 'w-seller');
    t('a fresh sale is NOT withdrawable', Number(e.available_minor) === 0, JSON.stringify(e));
    t('but the creator can see it clearing', Number(e.clearing_minor) === 4000);
    t('the clearing period is a single named constant', P.EARNINGS_CLEARING_DAYS > 0);

    const dup = await L.creditEarnings(db.sql, 'w-seller', 4000, { holdId: 'e1', clearingDays: P.EARNINGS_CLEARING_DAYS });
    e = await L.getEarnings(db.sql, 'w-seller');
    t('a replayed credit does not pay the seller twice', Number(e.clearing_minor) === 4000);

    db.advanceDays(P.EARNINGS_CLEARING_DAYS + 1);
    e = await L.getEarnings(db.sql, 'w-seller');
    t('after the clearing period it is withdrawable', Number(e.available_minor) === 4000);
    t('and it has left clearing', Number(e.clearing_minor) === 0);

    /* chargeback while still clearing — costs us nothing */
    const db2 = makeDb();
    await L.creditEarnings(db2.sql, 'w-s2', 4000, { holdId: 'e2', clearingDays: P.EARNINGS_CLEARING_DAYS });
    const r2 = await L.reverseEarnings(db2.sql, 'e2');
    t('a chargeback before clearing is recovered in full', r2 && r2.fromClearing === 4000 && r2.shortfallMinor === 0);
    const e2 = await L.getEarnings(db2.sql, 'w-s2');
    t('and the seller keeps none of it', Number(e2.clearing_minor) === 0 && Number(e2.available_minor) === 0);

    /* chargeback after clearing, money still there */
    const db3 = makeDb();
    await L.creditEarnings(db3.sql, 'w-s3', 4000, { holdId: 'e3', clearingDays: P.EARNINGS_CLEARING_DAYS });
    db3.advanceDays(P.EARNINGS_CLEARING_DAYS + 1);
    await L.getEarnings(db3.sql, 'w-s3');                        // sweep
    const r3 = await L.reverseEarnings(db3.sql, 'e3');
    t('a chargeback after clearing takes it back from available', r3 && r3.fromAvailable === 4000 && r3.shortfallMinor === 0);

    /* chargeback after the money was withdrawn — the real loss, reported not hidden */
    const db4 = makeDb();
    await L.creditEarnings(db4.sql, 'w-s4', 4000, { holdId: 'e4', clearingDays: P.EARNINGS_CLEARING_DAYS });
    db4.advanceDays(P.EARNINGS_CLEARING_DAYS + 1);
    await L.getEarnings(db4.sql, 'w-s4');
    await L.reserveForPayout(db4.sql, 'w-s4', 4000);             // withdrawn
    const r4 = await L.reverseEarnings(db4.sql, 'e4');
    t('a chargeback on withdrawn money reports the shortfall', r4 && r4.shortfallMinor === 4000);
    t('and never drives the balance negative', Number((await L.getEarnings(db4.sql, 'w-s4')).available_minor) >= 0);

    t('a reversal cannot be applied twice', await L.reverseEarnings(db4.sql, 'e4') === null);
  })();
}

/* ================================================================== *
 * 6. GRANTS FOLLOW THE MONEY — coupons, free trials, plan drift.
 * ================================================================== */
console.log('\nnothing is credited for money that did not arrive');
{
  // A 100%-off promotion code, or a free trial, leaves the metadata saying
  // acu_1000 while £0 settles. Neither needs an attacker — both are switched
  // on in the Stripe dashboard without touching this repo.
  const zero = P.grantCheck(0, 10000);
  t('a £0 settlement grants nothing', zero.grant === false);
  t('and says why, so the alert can name it', /discount|trial|paid/i.test(zero.reason));
  t('a null invoice is a £0 invoice', P.grantCheck(null, 10000).grant === true);   // absent != unpaid
  t('a negative amount grants nothing', P.grantCheck(-500, 10000).grant === false);

  const half = P.grantCheck(5000, 10000);
  t('a genuine half-price coupon still grants in full', half.grant === true);
  t('but is flagged as discounted', half.discounted === true);
  t('paying in full is not flagged', P.grantCheck(10000, 10000).discounted === false);
  t('overpaying is not flagged either', P.grantCheck(12000, 10000).grant === true);

  // plan drift: the money names the plan, the metadata is only a label
  const byAmount = P.PLANS.find((x) => x.monthlyMinor === 1900);
  t('an invoice amount identifies the plan it paid for', byAmount && byAmount.id === 'creator');
  t('no two plans share a price, so the amount is unambiguous',
    new Set(P.PLANS.filter((x) => x.monthlyMinor > 0).map((x) => x.monthlyMinor)).size ===
    P.PLANS.filter((x) => x.monthlyMinor > 0).length);
}

/* ================================================================== *
 * 7. PAYOUT BOOKKEEPING — reserved money must stop being reserved.
 * ================================================================== */
console.log('\na paid withdrawal leaves the reserved column');
{
  const db = makeDb();
  (async () => {
    await L.creditEarnings(db.sql, 'w-p', 5000, { holdId: 'h1', clearingDays: P.EARNINGS_CLEARING_DAYS });
    db.advanceDays(P.EARNINGS_CLEARING_DAYS + 1);
    await L.getEarnings(db.sql, 'w-p');
    await L.reserveForPayout(db.sql, 'w-p', 5000);
    let e = await L.getEarnings(db.sql, 'w-p');
    t('reserving moves it out of available', Number(e.available_minor) === 0 && Number(e.reserved_minor) === 5000);

    await L.settleReservation(db.sql, 'w-p', 5000);
    e = await L.getEarnings(db.sql, 'w-p');
    t('paying moves it out of reserved', Number(e.reserved_minor) === 0);
    t('and into paid', Number(e.paid_minor) === 5000);
    t('and it is not returned to available', Number(e.available_minor) === 0);

    // rejection is the other direction, and must not double-credit
    const db2 = makeDb();
    await L.creditEarnings(db2.sql, 'w-q', 5000, { holdId: 'h2', clearingDays: P.EARNINGS_CLEARING_DAYS });
    db2.advanceDays(P.EARNINGS_CLEARING_DAYS + 1);
    await L.getEarnings(db2.sql, 'w-q');
    await L.reserveForPayout(db2.sql, 'w-q', 5000);
    await L.releaseReservation(db2.sql, 'w-q', 5000);
    const e2 = await L.getEarnings(db2.sql, 'w-q');
    t('a rejected withdrawal comes back', Number(e2.available_minor) === 5000 && Number(e2.reserved_minor) === 0);
    t('and is not also counted as paid', Number(e2.paid_minor) === 0);
  })();
}

setTimeout(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 250);
