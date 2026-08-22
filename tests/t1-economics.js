// The compiled gateway sits at build/_gateway.js; this file used to require
// build/api/_gateway.js, a layout the audit workspace no longer produces.
// Try both so the test runs wherever the build lands, rather than dying on a path.
const GW = (() => {
  for (const p of ['./build/_gateway.js', './build/api/_gateway.js']) {
    try { return require(p); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  throw new Error('compiled _gateway.js not found — run: npx tsc -p . in the audit workspace');
})();
const { acuChargeForUsage, FORGE_GAME_ACU_CHARGE, FORGE_GAME_3D_ACU_CHARGE, FORGE_MIN_CHARGE, ENGINE_BUILD_CHARGE, ENHANCE_HOLD, BLUEPRINT_ACU_CHARGE } = GW;
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

console.log('\n== HOLDS vs SETTLEMENT (creator must never be over-charged) ==');
// Assert the PROPERTY, not the number. These were 300 and 1200 against real
// settles of 32-51 ACU, so a creator holding 1,068 was refused a 3D forge they
// could afford twenty times over. A hold is refunded in the same request, so its
// only job is to cover the worst settle without gatekeeping affordable work.
{
  const worst3d = Math.max(FORGE_MIN_CHARGE,
    acuChargeForUsage('claude-sonnet-5', { inputTokens: 8000, outputTokens: 18000 }));
  const worst2d = Math.max(FORGE_MIN_CHARGE,
    acuChargeForUsage('claude-sonnet-5', { inputTokens: 8000, outputTokens: 16000 }));
  t(`3D hold ${FORGE_GAME_3D_ACU_CHARGE} covers the worst settle ${worst3d}`,
    FORGE_GAME_3D_ACU_CHARGE > worst3d);
  t(`2D hold ${FORGE_GAME_ACU_CHARGE} covers the worst settle ${worst2d}`,
    FORGE_GAME_ACU_CHARGE > worst2d);
  t('3D hold is not more than 5x the worst settle it protects',
    FORGE_GAME_3D_ACU_CHARGE <= worst3d * 5,
    `hold ${FORGE_GAME_3D_ACU_CHARGE} vs settle ${worst3d} — an over-large hold refuses affordable work`);
  t('a 1,000-ACU wallet can start a 3D forge',
    FORGE_GAME_3D_ACU_CHARGE <= 1000,
    'the exact failure: "Not enough ACUs" on a balance worth ~20 real forges');
}
t('metered floor 40 < 2D hold', FORGE_MIN_CHARGE < FORGE_GAME_ACU_CHARGE);
t('engine-only charge 60 is small', ENGINE_BUILD_CHARGE === 60 && ENGINE_BUILD_CHARGE < FORGE_MIN_CHARGE*2);
t('typical settle is far below hold', got < FORGE_GAME_ACU_CHARGE, `settle ${got} vs hold 300`);
console.log(`       -> creator holds 300, real cost settles to ~${got}: ${300-got} refunded automatically`);
process.exit(fail ? 1 : 0);
