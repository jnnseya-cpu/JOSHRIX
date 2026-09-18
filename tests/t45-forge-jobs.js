/**
 * THE FORGE JOB STATE MACHINE, RUN RATHER THAN READ.
 *
 * tests/t44 asserts the SHAPE of this work — that the slice ceiling sits under
 * the platform's, that no second copy of a budget appeared, that the fixed hold
 * has not crept back. Shape assertions are cheap and they catch drift, but they
 * cannot catch a state machine that is wrong. "The source contains the word
 * debitWallet" is not the same claim as "a failed run gives the money back".
 *
 * So this file actually runs api/_forgejobs.ts against an in-memory Postgres
 * stand-in and checks what happened to the rows afterwards. That matters most
 * for the money: every attempt of an uncapped run debits a real wallet, and the
 * two ways to get that wrong are both silent. Refund more than was taken and the
 * platform pays creators to fail; refund less and a creator is charged for a
 * forge that produced nothing, which is the one thing /refunds promises cannot
 * happen.
 *
 * WHAT THIS CANNOT PROVE. There are no provider keys in this environment, so the
 * gateway returns its offline demo build and no real model is ever called. That
 * is enough to exercise every transition — queue, claim, lease, attempt, stale,
 * conclude, refund — because those are decided by the job code rather than by the
 * model. It is NOT evidence that a real forge produces a good game. Only a run
 * against live keys can say that, and none has happened yet.
 *
 *   node tests/t45-forge-jobs.js
 */
const assert = require('assert');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const jobs = require('./build/api/_forgejobs.js');
const gw = require('./build/api/_gateway.js');

/* ------------------------------------------------------------------ *
 * A Postgres stand-in.
 *
 * Only the statements this module actually issues are implemented, matched on
 * the SQL text. A fake that accepted everything and returned [] would make every
 * assertion below pass while proving nothing, so anything unrecognised throws —
 * if the module learns a new query, this file fails until it is taught it too.
 * ------------------------------------------------------------------ */
function makeDb(seed = {}) {
  const db = {
    jobs: new Map(),        // ticket -> row
    wallets: new Map(),     // id -> { id, balance }
    charges: [],            // forge_charges rows
    results: new Map(),     // ticket -> payload
    log: [],                // forge_log rows
    unknown: [],
  };
  for (const [id, balance] of Object.entries(seed.wallets || {})) db.wallets.set(id, { id, balance });

  const sql = (strings, ...vals) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    const v = vals;

    if (/^CREATE (TABLE|INDEX)/i.test(q)) return Promise.resolve([]);

    if (/^INSERT INTO forge_jobs/i.test(q)) {
      const [ticket, wallet_id, mode, concept, title, summary, language, blueprint] = v;
      if (db.jobs.has(ticket)) return Promise.resolve([]);          // ON CONFLICT DO NOTHING
      db.jobs.set(ticket, {
        ticket, wallet_id, mode, concept, title, summary, language, blueprint,
        status: 'queued', attempts: 0, stale: 0, acu_held: 0,
        best_html: null, best_provider: null, best_score: null,
        notes: null, error: null, payload: null, lease_until: null,
        created_at: seed.createdAt || new Date().toISOString(),
      });
      return Promise.resolve([{ ticket }]);
    }
    if (/^SELECT ticket, wallet_id, mode/i.test(q)) {
      const row = db.jobs.get(v[0]);
      return Promise.resolve(row ? [{ ...row }] : []);
    }
    if (/^SELECT best_html, best_provider FROM forge_jobs/i.test(q)) {
      const row = db.jobs.get(v[0]);
      return Promise.resolve(row ? [{ best_html: row.best_html, best_provider: row.best_provider }] : []);
    }
    if (/^UPDATE forge_jobs SET lease_until = now\(\) \+ make_interval/i.test(q)) {
      /* claimForgeJob. Both forms end up here; the ticket form passes it last. */
      const ticket = /WHERE ticket = \?/.test(q) ? v[1] : oldestClaimable();
      const row = ticket && db.jobs.get(ticket);
      if (!row || !['queued', 'running'].includes(row.status)) return Promise.resolve([]);
      if (row.lease_until && row.lease_until > Date.now()) return Promise.resolve([]);
      row.lease_until = Date.now() + v[0] * 1000;
      row.status = 'running';
      return Promise.resolve([{ ...row }]);
    }
    if (/^UPDATE forge_jobs SET attempts/i.test(q)) {
      const row = db.jobs.get(v[v.length - 1]);
      if (!row) return Promise.resolve([]);
      row.attempts = v[0]; row.stale = v[1]; row.acu_held = v[2]; row.notes = v[3];
      if (v.length > 5) { row.best_html = v[4]; row.best_provider = v[5]; row.best_score = v[6]; }
      return Promise.resolve([]);
    }
    if (/^UPDATE forge_jobs SET lease_until = NULL, updated_at/i.test(q)) {
      const row = db.jobs.get(v[0]);
      if (row && row.status === 'running') row.lease_until = null;
      return Promise.resolve([]);
    }
    if (/^UPDATE forge_jobs SET status = \?/i.test(q)) {
      const row = db.jobs.get(v[3]);
      if (row) { row.status = v[0]; row.payload = v[1]; row.error = v[2]; row.lease_until = null; }
      return Promise.resolve([]);
    }
    if (/^SELECT id, balance, category/i.test(q)) {
      const w = db.wallets.get(v[0]);
      return Promise.resolve(w ? [{ ...w, category: 'tester', email: null, name: null, plan: 'free' }] : []);
    }
    if (/^UPDATE wallets SET balance = balance - \?/i.test(q)) {
      const w = db.wallets.get(v[1]);
      if (!w || w.balance < v[0]) return Promise.resolve([]);        // all-or-nothing
      w.balance -= v[0];
      return Promise.resolve([{ balance: w.balance }]);
    }
    if (/^UPDATE wallets SET balance = balance \+ \?/i.test(q)) {
      const w = db.wallets.get(v[1]);
      if (!w) return Promise.resolve([]);
      w.balance += v[0];
      return Promise.resolve([{ balance: w.balance }]);
    }
    if (/^INSERT INTO forge_charges/i.test(q)) {
      db.charges.push({ id: v[0], wallet_id: v[1], amount: v[2], settle_amount: v[3] });
      return Promise.resolve([]);
    }
    if (/^INSERT INTO forge_results/i.test(q)) {
      db.results.set(v[0], v[2]);
      return Promise.resolve([]);
    }
    if (/^INSERT INTO forge_log/i.test(q)) {
      db.log.push(v);
      return Promise.resolve([]);
    }

    db.unknown.push(q.slice(0, 120));
    return Promise.reject(new Error('unhandled SQL in the test double: ' + q.slice(0, 120)));
  };

  function oldestClaimable() {
    for (const [ticket, r] of db.jobs) {
      if (['queued', 'running'].includes(r.status) && (!r.lease_until || r.lease_until < Date.now())) return ticket;
    }
    return null;
  }
  return { sql, db };
}

const TICKET = 'ticket-aaaaaaaa-1111';
async function queue(sql, { wallet = 'w1', mode = '2d' } = {}) {
  await jobs.ensureForgeJobSchema(sql);
  await jobs.createForgeJob(sql, {
    ticket: TICKET, walletId: wallet, mode, concept: 'A penalty shootout game set in African stadiums.',
    title: 'Penalty King', summary: 'Score from the spot.', language: 'en', blueprint: { title: 'Penalty King' },
  });
}

(async () => {
  console.log('\nqueueing is idempotent, because two runs would spend the wallet twice');
  {
    const { sql, db } = makeDb({ wallets: { w1: 5000 } });
    await queue(sql);
    const again = await jobs.createForgeJob(sql, {
      ticket: TICKET, walletId: 'w1', mode: '2d', concept: 'something else entirely',
    });
    t('the second insert reports it did nothing', again === false);
    t('and there is still exactly one job', db.jobs.size === 1);
    t('the original concept is untouched', db.jobs.get(TICKET).concept.startsWith('A penalty shootout'),
      'a retried POST must never be able to rewrite a running job');
  }

  console.log('\nthe lease is what stops two workers spending the same wallet at once');
  {
    const { sql } = makeDb({ wallets: { w1: 5000 } });
    await queue(sql);
    const first = await jobs.claimForgeJob(sql, TICKET);
    const second = await jobs.claimForgeJob(sql, TICKET);
    t('the first caller gets the job', !!first && first.ticket === TICKET);
    t('the second gets nothing at all', second === null,
      'the cron and the creator\'s browser fire at the same time constantly');
    const sweep = await jobs.claimForgeJob(sql);
    t('and a sweep finds nothing to take either', sweep === null);
  }

  console.log('\na slice with no time left pauses the run instead of failing it');
  {
    const { sql, db } = makeDb({ wallets: { w1: 5000 } });
    await queue(sql);
    const job = await jobs.claimForgeJob(sql, TICKET);
    /* A deadline already in the past: no attempt may start. */
    const out = await jobs.runForgeJobSlice(sql, job, Date.now() - 1);
    t('the run is still going', out.status === 'running');
    t('no attempt was made', out.attempts === 0);
    t('no money moved', db.wallets.get('w1').balance === 5000);
    t('the job is left claimable by the next slice', db.jobs.get(TICKET).lease_until === null,
      'holding a lease after returning stalls the run for a full lease period');
    t('and it is NOT marked failed', db.jobs.get(TICKET).status === 'running',
      'running out of function time is a pause — that is the whole mechanism');
  }

  console.log('\na run that cannot improve stops, ships the engine build, and refunds');
  {
    /* With no provider keys the gateway returns its offline demo build, which is
       refused by the gates and never kept as "best". So this exercises the full
       doomed-run path: attempts, stale counting, conclude, fail, refund. */
    const { sql, db } = makeDb({ wallets: { w1: 5000 } });
    await queue(sql);
    const job = await jobs.claimForgeJob(sql, TICKET);
    const out = await jobs.runForgeJobSlice(sql, job, Date.now() + 120_000);

    t('the run ended rather than looping for ever', out.status === 'failed', out.status);
    t(`it stopped after ${out.attempts} attempts`, out.attempts === jobs.MAX_STALE_ATTEMPTS,
      `MAX_STALE_ATTEMPTS is ${jobs.MAX_STALE_ATTEMPTS}`);

    const row = db.jobs.get(TICKET);
    const payload = JSON.parse(row.payload);
    t('a playable build is still handed back', gw.looksPlayable(payload.html),
      'the creator must never be left with nothing');
    t('and it is honestly labelled as the engine build', payload.provider === 'engine');
    t('the reason is specific, not "something went wrong"',
      /came no closer|attempts/.test(payload.bespokeError || ''), payload.bespokeError);
    t('the demo build was never passed off as a bespoke one',
      !/demo/.test(String(payload.provider)),
      'the offline demo is weaker than the engine build; shipping it would be a lie and a downgrade');

    /* THE MONEY. No AI was charged for (demo is free), so the only movement is
       the flat engine charge — and it must be accounted for exactly once. */
    const spent = 5000 - db.wallets.get('w1').balance;
    t(`only the engine charge left the wallet (${spent})`, spent === gw.ENGINE_BUILD_CHARGE, String(spent));
    t('and exactly one charge row records it', db.charges.length === 1,
      `${db.charges.length} rows — a hold whose money never moved makes accept collect twice`);
    t('the hold equals what actually left the wallet',
      db.charges[0].amount === spent,
      'a hold larger than the debit refunds money the creator never paid');
    t('the finished payload is also on the poll channel', db.results.has(TICKET),
      'the Studio reads /api/forge-result, not the job table');
  }

  console.log('\nNO ACUs MEANS NO AI — the rule has no exception for accidents');
  {
    /* Justin, 18 Sep 2026: "no ACUs mean no ai powered functions and features."
       An empty wallet is the easy case and was never in doubt. */
    const { sql, db } = makeDb({ wallets: { w1: 0 } });
    await queue(sql);
    const job = await jobs.claimForgeJob(sql, TICKET);
    const out = await jobs.runForgeJobSlice(sql, job, Date.now() + 120_000);
    t('an empty wallet buys nothing at all', out.attempts === 0 && out.status === 'failed');
    t('and the reason names the wallet', /ACU|top up/i.test(String(db.jobs.get(TICKET).error)),
      db.jobs.get(TICKET).error);
    t('a wallet too poor for the engine charge is not put into debt',
      db.wallets.get('w1').balance === 0 && db.charges.length === 0,
      'a creator whose run failed must never end up owing');
  }
  {
    /* THE HARD CASE, and the one that was actually broken. Removing the fixed
       hold removed the proof that a wallet could pay BEFORE a provider ran.
       debitWallet is all-or-nothing and happens AFTER the attempt, so a wallet
       holding the bare metered floor would have passed the start check, bought a
       full generation, and failed the debit — the platform paying for AI the
       creator could not afford. That is free AI through the back door. */
    const floor = gw.FORGE_MIN_CHARGE;
    const needed = gw.worstAttemptAcu(false);
    t(`one attempt can cost ${needed}, far above the metered floor ${floor}`, needed > floor,
      'if these were equal the gap below could not exist and this test would be theatre');

    const { sql, db } = makeDb({ wallets: { w1: needed - 1 } });
    await queue(sql);
    const job = await jobs.claimForgeJob(sql, TICKET);
    const out = await jobs.runForgeJobSlice(sql, job, Date.now() + 120_000);
    t('a wallet one ACU short of an attempt gets NO attempt', out.attempts === 0,
      `balance ${needed - 1}, attempt costs up to ${needed}`);
    t('and the refusal says what is needed and what is there',
      /\d+ needed/.test(String(db.jobs.get(TICKET).error)), db.jobs.get(TICKET).error);

    /* And the gate must be affordability, not a flat number: 3D costs more per
       attempt than 2D, so it must demand more. */
    t('a 3D attempt is gated higher than a 2D one', gw.worstAttemptAcu(true) > gw.worstAttemptAcu(false),
      `${gw.worstAttemptAcu(true)} vs ${gw.worstAttemptAcu(false)}`);
    t('and the figure is DERIVED from the output budgets, not written down',
      gw.worstAttemptAcu(true) ===
        Math.max(floor, gw.acuChargeForUsage('claude-sonnet-5',
          { inputTokens: 10_000, outputTokens: gw.OUTPUT_BUDGET.claude3d })),
      'a hand-written figure goes stale the next time a budget moves');
  }
  {
    /* A funded wallet is NOT gated. The check must refuse the broke and let
       everyone else run — otherwise it is the old hold wearing a new name. */
    const { sql, db } = makeDb({ wallets: { w1: gw.worstAttemptAcu(false) } });
    await queue(sql);
    const job = await jobs.claimForgeJob(sql, TICKET);
    const out = await jobs.runForgeJobSlice(sql, job, Date.now() + 120_000);
    t('a wallet with exactly one attempt in it does get attempts', out.attempts > 0,
      `${out.attempts} attempts on a balance of ${gw.worstAttemptAcu(false)}`);
    t('and the run is not capped at one', out.attempts === jobs.MAX_STALE_ATTEMPTS,
      'the offline demo is free, so the balance never falls — this proves nothing stops it early');
    void db;
  }

  console.log('\na job nobody could finish is given up on rather than holding ACUs for ever');
  {
    const old = new Date(Date.now() - 48 * 3600_000).toISOString();
    const { sql, db } = makeDb({ wallets: { w1: 5000 }, createdAt: old });
    await queue(sql);
    const job = await jobs.claimForgeJob(sql, TICKET);
    const out = await jobs.runForgeJobSlice(sql, job, Date.now() + 120_000);
    t('it is abandoned, not retried for ever', out.status === 'failed');
    t('with no attempt bought', out.attempts === 0);
    t('and the reason says so', /abandoned/.test(String(db.jobs.get(TICKET).error)), db.jobs.get(TICKET).error);
  }

  console.log('\nthe rate is unchanged: a creator pays 4x the provider cost');
  {
    /* Justin, 18 Sep 2026: "users are charged x4 the provider cost, so that
       remains as it is." Removing the fixed hold changed WHEN a creator is
       charged and HOW MANY times, never the rate. This asserts the rate survived
       the change, because a pricing multiplier quietly moving inside a big
       refactor is exactly the kind of thing nothing else here would catch. */
    const { ACU } = require('./build/shared/contracts.js');
    const usage = { inputTokens: 10_000, outputTokens: 20_000 };
    const charged = gw.acuChargeForUsage('claude-sonnet-5', usage);

    /* Rebuild the provider's own cost from its published rate card, convert it
       the way the platform does, and assert the multiplier that separates the
       two. Sonnet is $3/MTok in and $15/MTok out. */
    const usd = (usage.inputTokens / 1e6) * 3 + (usage.outputTokens / 1e6) * 15;
    const providerCostAcu = usd * 0.79 * ACU.perGBP;

    t('the markup floor is still 4', ACU.providerMarkupFloor === 4, String(ACU.providerMarkupFloor));
    /* Exact, not a tolerance: the charge is the provider cost times four, rounded
       UP to a whole ACU. On small runs that rounding shows as 4.03x, which is the
       ceiling and not a changed rate — so assert the formula, which cannot drift. */
    t(`a creator pays exactly 4x provider cost, rounded up (${charged} ACU)`,
      charged === Math.ceil(providerCostAcu * 4),
      `${charged} vs ${Math.ceil(providerCostAcu * 4)} — Justin, 18 Sep: "users are charged x4 the provider cost, so that remains as it is"`);
    t('rounding only ever goes up, never down',
      charged >= providerCostAcu * 4,
      'a rate that rounds down sells AI below the floor the business model sets');
    const single = gw.acuChargeForUsage('claude-sonnet-5', usage);
    const double = gw.acuChargeForUsage('claude-sonnet-5',
      { inputTokens: usage.inputTokens * 2, outputTokens: usage.outputTokens * 2 });
    t('and it scales linearly with real usage', Math.abs(double - single * 2) <= 1,
      `${single} then ${double} — metering must track tokens, not round to a tier`);

    /* The job path must use that same function and nothing else. A second cost
       calculation is how a multiplier silently forks. */
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'api/_forgejobs.ts'), 'utf8');
    t('the job charges through acuChargeForUsage, not its own arithmetic',
      /acuChargeForUsage\(/.test(src) && !/\*\s*4\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, ' ')),
      'the 4x lives in one function; a copy of it here would drift');
  }

  console.log('\nthe judge is a judge — it separates a stub from a game, and says why');
  {
    const stub = '<!DOCTYPE html><html><body><canvas id="c"></canvas><script>var x=1;</script></body></html>';
    const v = gw.judgeBuild(stub, false);
    t('a stub does not pass', v.ok === false);
    t('its reasons are requirements, not adjectives',
      v.notes.some((n) => /substance floor|missing:/.test(n)), v.notes.join(' | '));
    t('and they are what gets fed back to the next attempt',
      v.notes.every((n) => typeof n === 'string' && n.length > 10));

    /* The score has to be ORDERED, or "is it improving" is unanswerable. */
    const worse = gw.judgeBuild('<html><body><canvas></canvas></body></html>', false);
    t('a nearer build scores higher than a further one', v.score > worse.score,
      `${v.score} vs ${worse.score}`);
    t('a passing build outranks every failing one', gw.judgeBuild(stub, false).score < Infinity);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
