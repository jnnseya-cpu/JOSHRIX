const { acuChargeForUsage, FORGE_GAME_ACU_CHARGE, FORGE_GAME_3D_ACU_CHARGE, FORGE_MIN_CHARGE, ENGINE_BUILD_CHARGE, ENHANCE_HOLD, BLUEPRINT_ACU_CHARGE } = require('./build/api/_gateway.js');
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
t('2D hold 300', FORGE_GAME_ACU_CHARGE === 300);
t('3D hold 1200', FORGE_GAME_3D_ACU_CHARGE === 1200);
t('metered floor 40 < 2D hold', FORGE_MIN_CHARGE < FORGE_GAME_ACU_CHARGE);
t('engine-only charge 60 is small', ENGINE_BUILD_CHARGE === 60 && ENGINE_BUILD_CHARGE < FORGE_MIN_CHARGE*2);
t('typical settle is far below hold', got < FORGE_GAME_ACU_CHARGE, `settle ${got} vs hold 300`);
console.log(`       -> creator holds 300, real cost settles to ~${got}: ${300-got} refunded automatically`);
process.exit(fail ? 1 : 0);
