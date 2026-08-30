/**
 * SPECIFICATIONS THAT ARE ACTUALLY IMPLEMENTED.
 *
 * Three endpoints described real features and delivered nothing:
 *
 *   /api/telemetry   validated every Forge Graph event and THREW IT AWAY,
 *                    answering { mode: "demo" }. play.html, studio.html and
 *                    embed.js all posted to it. shared/telemetry.ts opens with
 *                    "the moat only accrues if collection starts with the first
 *                    user" — collection had never started.
 *
 *   /api/wallet      returned INVENTED MONEY. 1,873 ACUs, £482 available, £964
 *                    lifetime, and three fabricated ledger rows including a sale
 *                    of a game called "Penalty King" that has never existed.
 *                    Hard-coded, identical for every caller.
 *
 *   /api/referrals   minted a referral code, answered { mode: "demo" } and
 *                    recorded nothing — so /referrals handed people a link that
 *                    could never pay them, beneath a page describing a reward
 *                    ladder and a 1% lifetime commission in detail.
 *
 * This file exists to stop that class of thing coming back: a feature is not
 * finished because an endpoint answers 200.
 *
 *   node tests/t35-no-placeholders.js
 */
const fs = require('fs');
const path = require('path');
const led = require('./build/api/_ledger.js');
const growth = require('./build/shared/growth.js');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/* ---------- a fake Postgres that really stores rows ---------- */
function makeDb() {
  const st = { telemetry: [], codes: new Map(), referrals: new Map(), wallets: new Map(), earnings: new Map() };
  const sql = (strings, ...vals) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (/^(CREATE|ALTER)/i.test(q)) return Promise.resolve([]);

    if (q.includes('INSERT INTO telemetry_events')) {
      const [event, session_id, game_id, language, props, client_ts] = vals;
      st.telemetry.push({ event, session_id, game_id, language, props, client_ts });
      return Promise.resolve([]);
    }
    if (q.includes('SELECT code FROM referral_codes WHERE wallet_id')) {
      const hit = [...st.codes.entries()].find(([, w]) => w === vals[0]);
      return Promise.resolve(hit ? [{ code: hit[0] }] : []);
    }
    if (q.includes('INSERT INTO referral_codes')) {
      const [code, wallet] = vals;
      if (st.codes.has(code)) return Promise.resolve([]);        // ON CONFLICT DO NOTHING
      st.codes.set(code, wallet);
      return Promise.resolve([{ code }]);
    }
    if (q.includes('SELECT wallet_id FROM referral_codes WHERE code')) {
      const w = st.codes.get(vals[0]);
      return Promise.resolve(w ? [{ wallet_id: w }] : []);
    }
    if (q.includes('INSERT INTO referrals')) {
      const [referred, code, referrer] = vals;
      if (st.referrals.has(referred)) return Promise.resolve([]);  // PK guard
      st.referrals.set(referred, { referred, code, referrer, converted_at: null, reward_acu: 0 });
      return Promise.resolve([{ referred_wallet: referred }]);
    }
    if (q.includes('UPDATE referrals SET converted_at')) {
      const [reward, referred] = vals;
      const r = st.referrals.get(referred);
      if (!r || r.converted_at) return Promise.resolve([]);        // converts once
      r.converted_at = Date.now(); r.reward_acu = reward;
      return Promise.resolve([{ referrer_wallet: r.referrer, code: r.code }]);
    }
    if (q.includes('FROM referrals WHERE referrer_wallet')) {
      const mine = [...st.referrals.values()].filter((r) => r.referrer === vals[0]);
      return Promise.resolve([{
        referred: mine.length,
        converted: mine.filter((r) => r.converted_at).length,
        acu_earned: mine.reduce((n, r) => n + r.reward_acu, 0),
      }]);
    }
    return Promise.resolve([]);
  };
  return { sql, st };
}

(async () => {

/* ================================================================= *
 * 1. TELEMETRY IS KEPT
 * ================================================================= */
console.log('\nthe Forge Graph actually stores events');
{
  const db = makeDb();
  const n = await led.recordTelemetry(db.sql, [
    { event: 'play.session_start', sessionId: 'ps-abc123', gameId: 'g-x', language: 'en', ts: Date.now(), props: { status: 'approved' } },
    { event: 'forge.published', sessionId: 'ps-abc123', ts: Date.now() },
  ]);
  t('a batch is written, not discarded', n === 2, `wrote ${n}`);
  t('the rows carry the event name', db.st.telemetry[0].event === 'play.session_start');
  t('and the game it happened in', db.st.telemetry[0].game_id === 'g-x');
  t('and the props as json', JSON.parse(db.st.telemetry[0].props).status === 'approved');
  t('an event with no game is still stored', db.st.telemetry[1].game_id === undefined || db.st.telemetry[1].game_id === null);

  // One malformed row must not lose the batch — telemetry is never the thing
  // that breaks the page that sent it.
  const flaky = { sql: (s, ...v) => (s.join('').includes('INSERT INTO telemetry_events') && v[0] === 'bad'
    ? Promise.reject(new Error('boom')) : Promise.resolve([])) };
  const wrote = await led.recordTelemetry(flaky.sql, [
    { event: 'bad', sessionId: 'x'.repeat(8) },
    { event: 'play.session_end', sessionId: 'x'.repeat(8) },
  ]);
  t('a failing row does not lose the rest of the batch', wrote === 1, `wrote ${wrote}`);
}

/* ================================================================= *
 * 2. NO INVENTED MONEY ANYWHERE
 * ================================================================= */
console.log('\nno endpoint returns fabricated figures');
{
  /* Read the CODE, not the commentary. Each of these files now carries a
     comment naming exactly what it used to fabricate — that history is worth
     keeping, and a check that matched it would fail on the explanation while
     the fabrication itself walked back in unnoticed. */
  const codeOf = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

  const wallet = codeOf('api/wallet.ts');
  // The exact fabrications that used to be served.
  t('the invented ACU balance is gone', !wallet.includes('1873'));
  t('the invented earnings are gone', !/48_?200|12_?350|96_?400/.test(wallet));
  t('the invented sale of "Penalty King" is gone', !wallet.includes('Penalty King'));
  t('it no longer answers mode:"demo"', !/mode:\s*["']demo["']/.test(wallet));
  t('it reads the real balance from the ledger', wallet.includes('getWallet') && wallet.includes('getEarnings'));
  t('and it requires the caller to own the wallet', wallet.includes('walletOwnerUid') && wallet.includes('callerIdentity'));

  const tele = codeOf('api/telemetry.ts');
  t('telemetry no longer answers mode:"demo"', !/mode:\s*["']demo["']/.test(tele));
  t('telemetry writes to the ledger', tele.includes('recordTelemetry'));

  const refs = codeOf('api/referrals.ts');
  t('referrals no longer answers mode:"demo"', !/mode:\s*["']demo["']/.test(refs));
  t('referrals persists the code', refs.includes('claimReferralCode'));
}

/* ================================================================= *
 * 3. THE REFERRAL PROGRAMME PAYS
 * ================================================================= */
console.log('\na referral link attributes, converts and pays — once');
{
  const db = makeDb();
  const PARTNER = 'w-partner000000', BUYER = 'w-buyer0000000', OTHER = 'w-other0000000';

  const claim = await led.claimReferralCode(db.sql, PARTNER, 'JX-JUSTIN');
  t('a partner claims a code', claim && claim.code === 'JX-JUSTIN' && claim.created === true);
  const again = await led.claimReferralCode(db.sql, PARTNER, 'JX-SOMETHINGELSE');
  t('and reloading returns the SAME code, never a second link',
    again && again.code === 'JX-JUSTIN' && again.created === false);
  const taken = await led.claimReferralCode(db.sql, OTHER, 'JX-JUSTIN');
  t('another wallet cannot take a code already owned', taken === null);

  t('a signup through the link is attributed',
    await led.attributeReferral(db.sql, BUYER, 'JX-JUSTIN') === true);
  // The first partner to bring someone is the one who gets paid.
  await led.claimReferralCode(db.sql, OTHER, 'JX-RIVAL');
  t('and cannot be re-attributed to a rival later',
    await led.attributeReferral(db.sql, BUYER, 'JX-RIVAL') === false);
  t('self-referral is refused', await led.attributeReferral(db.sql, PARTNER, 'JX-JUSTIN') === false);
  t('an unknown code attributes nothing', await led.attributeReferral(db.sql, 'w-zzz', 'JX-NOPE') === false);

  let stats = await led.referralStats(db.sql, PARTNER);
  t('the partner sees the signup', stats.referred === 1);
  t('but nothing is earned before they pay', stats.converted === 0 && stats.acu_earned === 0);

  const conv = await led.convertReferral(db.sql, BUYER, growth.REFERRAL_REWARD_ACU);
  t('the first payment converts the referral', conv && conv.referrer_wallet === PARTNER);
  const twice = await led.convertReferral(db.sql, BUYER, growth.REFERRAL_REWARD_ACU);
  t('a SECOND purchase pays nobody again', twice === null,
    'the reward is for bringing a paying customer, not for their spending');

  stats = await led.referralStats(db.sql, PARTNER);
  t('the partner is credited exactly once', stats.converted === 1 && stats.acu_earned === growth.REFERRAL_REWARD_ACU);
  t('an unreferred buyer converts nothing', await led.convertReferral(db.sql, 'w-nobody', 100) === null);
}

/* ================================================================= *
 * 4. THE PROMISE AND THE PAYMENT COME FROM ONE NUMBER
 * ================================================================= */
console.log('\nwhat the page promises is what the ledger pays');
{
  t('the reward is a single exported constant', typeof growth.REFERRAL_REWARD_ACU === 'number' && growth.REFERRAL_REWARD_ACU > 0);
  const page = fs.readFileSync(path.join(ROOT, 'frontend/referrals.html'), 'utf8');
  // The ladder used to say "ACU bonus" and name no figure, while nothing paid
  // one. If the constant changes, this fails until the page is updated too.
  t('the public ladder states that exact number',
    page.includes(`${growth.REFERRAL_REWARD_ACU} ACUs per paid referral`),
    `page must name ${growth.REFERRAL_REWARD_ACU}`);
  t('the page no longer says attribution is still to come',
    !/attribution activates|tracking goes live/i.test(page));
  t('status is derived from the ladder, not a second list',
    growth.statusForPaidReferrals(0) === 'Member' &&
    growth.statusForPaidReferrals(1) === 'Starter' &&
    growth.statusForPaidReferrals(20) === 'Verified Growth Referrer' &&
    growth.statusForPaidReferrals(1000) === 'Elite Referrer');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
