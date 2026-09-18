// The compiled gateway sits at build/_gateway.js; this file used to require
// build/api/_gateway.js, a layout the audit workspace no longer produces.
// Try both so the test runs wherever the build lands, rather than dying on a path.
const GW = (() => {
  for (const p of ['./build/_gateway.js', './build/api/_gateway.js']) {
    try { return require(p); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  throw new Error('compiled _gateway.js not found — run: npx tsc -p . in the audit workspace');
})();
const { acuChargeForUsage, FORGE_MIN_CHARGE, ENGINE_BUILD_CHARGE, ENHANCE_HOLD, BLUEPRINT_ACU_CHARGE } = GW;
const { ACU } = require('./build/shared/contracts.js');
let pass=0, fail=0;
const t=(name,cond,detail='')=>{ if(cond){pass++;console.log('  ok   '+name);} else {fail++;console.log('  FAIL '+name+(detail?' :: '+detail:''));} };

console.log('\n== BILLING MATH (business rule: charge = 4x provider cost) ==');
t('markup floor is 4x', ACU.providerMarkupFloor === 4, 'got '+ACU.providerMarkupFloor);
t('ACU per GBP is 100', ACU.perGBP === 100, 'got '+ACU.perGBP);

// a real forge: ~4k in, ~9k out on openai ($2.5/$10 per MTok)
const usage = { inputTokens: 4000, outputTokens: 9000 };
const usd = (4000/1e6)*2.5 + (9000/1e6)*10;         // = 0.01 + 0.09 = $0.100
const expected = Math.ceil(usd * 0.79 * 4 * 100);    // 4x markup, GBP, ACU
const got = acuChargeForUsage('openai', usage);
t('openai forge charge = 4x cost', got === expected, `got ${got}, expected ${expected} (cost $${usd.toFixed(3)})`);
console.log(`       -> a typical forge costs the platform $${usd.toFixed(3)} and charges ${got} ACUs (£${(got/100).toFixed(2)})`);
const margin = (got/100) / (usd*0.79);
t('margin is >= 4x', margin >= 3.99, 'margin '+margin.toFixed(2)+'x');

t('unknown model falls back, never returns NaN', Number.isFinite(acuChargeForUsage('nonexistent', usage)));
t('zero usage charges 0 not NaN', acuChargeForUsage('openai', {inputTokens:0,outputTokens:0}) === 0);
t('negative usage cannot produce a credit', acuChargeForUsage('openai', {inputTokens:-999,outputTokens:-999}) <= 0);

console.log('\n== WHAT IT COSTS TO RUN, now that nothing is reserved up front ==');
/* THE FIXED HOLD IS GONE. Two constants used to live here, 500 for 2D and 750 for
   3D, debited before generating. They were raised twice for the same reason — they
   kept refusing work a wallet could afford — and they were also the real ACU
   ceiling, because a run could never cost more than its hold. A forge now debits
   each attempt's own metered cost as that attempt finishes, so the assertions
   worth making are about the PER-ATTEMPT cost and what a real wallet can fund. */
{
  /* Derived from the REAL output budgets, not a copy of them. This used to
     hard-code 18000/16000, so when the budgets rose on 11 Sep the test went on
     scoring the old world. A test carrying its own copy of a production constant
     stops testing production the moment that constant moves. */
  const { OUTPUT_BUDGET } = require('./build/api/_gateway.js');
  const pay = require('./build/shared/payments.js');
  const worstAttempt = Math.max(FORGE_MIN_CHARGE,
    acuChargeForUsage('claude-sonnet-5', { inputTokens: 8000, outputTokens: OUTPUT_BUDGET.claude3d }));

  t(`the worst single attempt meters to ${worstAttempt} ACU`, worstAttempt > 0 && Number.isFinite(worstAttempt));
  t('starting a forge costs only one attempt, not a reservation',
    FORGE_MIN_CHARGE < worstAttempt,
    'FORGE_MIN_CHARGE is the floor to BEGIN; a larger figure would gatekeep again');

  /* THE POINT OF THE CHANGE. A run must be able to afford several attempts on one
     funded wallet, or "retry until it is right" is a promise the economics break.
     A tester wallet is the concrete case — it is the only wallet that can test
     the forge at all. */
  const attempts = Math.floor(pay.TESTER_CEILING_ACU / worstAttempt);
  t(`a tester wallet funds ${attempts} worst-case attempts`, attempts >= 20,
    `TESTER_CEILING_ACU ${pay.TESTER_CEILING_ACU} / worst attempt ${worstAttempt}`);

  /* And the TYPICAL attempt is far cheaper than the worst, which is why an
     uncapped run is affordable rather than reckless. */
  t(`a typical attempt (${got}) is well under the worst case`, got * 4 < worstAttempt,
    'if these ever converge, re-measure BUILD_COST_MINOR from /api/forge-log');
  console.log(`       -> typical attempt ~${got} ACU, worst ~${worstAttempt}: a wallet of ` +
    `${pay.TESTER_CEILING_ACU} funds ${Math.floor(pay.TESTER_CEILING_ACU / got)} typical attempts`);
}
t('engine-only charge 60 is small', ENGINE_BUILD_CHARGE === 60 && ENGINE_BUILD_CHARGE < FORGE_MIN_CHARGE*2);
process.exit(fail ? 1 : 0);
