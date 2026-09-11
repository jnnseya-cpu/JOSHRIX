/**
 * A FORGE MUST FINISH, OR HAND BACK SOMETHING PLAYABLE. NEVER DROP.
 *
 * Justin, 11 Sep 2026: "no time or ACU limit — better to cost more and run
 * longer than stop midway and get a frustrating product."
 *
 * Two different failures hide behind "stopped midway", and only one of them is
 * about time:
 *
 *   TRUNCATION. The model hits its output cap and the file ends without a
 *   closing tag. The gates reject it, the engine build ships instead, and the
 *   creator sees a generic game. This is what the 18 Aug probe recorded as
 *   'claude — truncated ("no closing </html>")'. It is fixed with tokens, not
 *   seconds, and tokens are the cheaper half.
 *
 *   THE DROP. The serverless function is killed at its maxDuration while the
 *   model is still writing. The connection dies and the creator sees "Code Agent
 *   unreachable" with NOTHING — strictly worse than a short game. The only
 *   defence is to abort the stream just before the platform does, which means
 *   the code's idea of the ceiling must match vercel.json's. It used to be three
 *   separate hard-coded numbers, which is three chances to raise one and forget
 *   another, and the one you forget silently becomes the real limit.
 *
 * This file exists because that mismatch is invisible until a real forge drops.
 *
 *   node tests/t44-forge-budget.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const gw = require('./build/api/_gateway.js');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
/* Strip comments: this file's own explanation names the numbers it guards. */
const src = fs.readFileSync(path.join(ROOT, 'api/_gateway.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

console.log('\nthe code ceiling sits below the platform ceiling');
{
  const maxDuration = (vercel.functions || {})['api/forge-game.ts']?.maxDuration;
  t('vercel.json sets a maxDuration for the forge', typeof maxDuration === 'number', String(maxDuration));
  t('FORGE_MAX_SECONDS is exported', typeof gw.FORGE_MAX_SECONDS === 'number', String(gw.FORGE_MAX_SECONDS));

  /* The margin has to cover building the reply, settling the hold and
     persisting the result AFTER generation returns. Ten seconds is the floor;
     less and a slow database write is enough to lose the whole run. */
  t(`FORGE_MAX_SECONDS (${gw.FORGE_MAX_SECONDS}) is at least 10s under maxDuration (${maxDuration})`,
    gw.FORGE_MAX_SECONDS <= maxDuration - 10,
    'raise BOTH together, or the function is killed mid-stream and the creator gets nothing');

  /* The other direction matters too: a code ceiling far below the platform one
     is paid-for time being thrown away. */
  t('and it is not needlessly far below it', gw.FORGE_MAX_SECONDS >= maxDuration - 60,
    'unused headroom is a shorter game for no reason');
}

console.log('\nevery timeout derives from that one number');
{
  /* Three hard-coded second-values used to live here. If a literal reappears,
     someone has added a fourth ceiling that will not move when the knob does. */
  const literals = (src.match(/\b(1[5-9]\d|2[0-9]\d)_?000\b/g) || [])
    .filter((n) => !/^16_?000$|^24_?000$|^32_?000$/.test(n));
  t('no stray hard-coded millisecond ceiling remains', literals.length === 0,
    literals.join(', ') + ' — derive it from FORGE_MAX_SECONDS instead');
  t('the generation deadline derives from the knob', /FORGE_MAX_MS\s*-\s*[\d_]+/.test(src));
  t('the provider timeout derives from it', /PROVIDER_TIMEOUT_MS\s*=\s*FORGE_MAX_MS/.test(src));
  t('the chain budget derives from it', /CHAIN_BUDGET_MS\s*=\s*FORGE_MAX_MS/.test(src));
}

console.log('\nthe knob is settable without a code change');
{
  t('FORGE_MAX_SECONDS reads the environment', /process\.env\.FORGE_MAX_SECONDS/.test(src));
  t('it has a floor so a typo cannot make it zero', /Math\.max\(\s*\d+/.test(src));
  const env = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  t('.env.example documents it', env.includes('FORGE_MAX_SECONDS'),
    'a knob nobody knows about is a constant');
}

console.log('\noutput budgets are large enough to finish a game');
{
  /* The two reference 3D games on this runtime are 10,975 and 15,862 bytes. A
     budget that cannot comfortably exceed the largest of them is a budget that
     will truncate the next one. */
  /* Read the exported table, not the assignment site. The numbers used to be
     written inline at the call, which meant the hold, the economics test and
     the budget could each be changed without the others noticing. There is one
     table now, and these assertions and t1 both read it. */
  const B = gw.OUTPUT_BUDGET || {};
  const claude = B.claude3d, gemini = B.gemini3d, openai = B.openai;

  t('the budgets are exported as one table',
    [claude, gemini, openai, B.claude2d, B.gemini2d].every((n) => typeof n === 'number'),
    JSON.stringify(B));
  t('and the call site reads that table rather than its own literals',
    /claudeMax\s*=\s*is3d\s*\?\s*OUTPUT_BUDGET\./.test(src) &&
    /geminiMax\s*=\s*is3d\s*\?\s*OUTPUT_BUDGET\./.test(src) &&
    /openaiMax\s*=\s*OUTPUT_BUDGET\./.test(src));
  t('3D gets more room than 2D', claude > B.claude2d && gemini > B.gemini2d,
    'a 3D game is the larger file; giving it the 2D budget is what truncates it');

  t(`claude 3D budget is generous (${claude})`, claude >= 24000,
    'the measured failure was truncation, and tokens are the cheap half of the fix');
  t(`gemini 3D budget is generous (${gemini})`, gemini >= 24000);
  /* gpt-4o's hard output cap is 16384. A request above it is REJECTED, so a
     generous number here removes the provider from the chain entirely. */
  t(`openai stays under its hard cap (${openai})`, openai > 0 && openai <= 16384,
    'above 16384 gpt-4o rejects the request outright — the fallback disappears');
}

console.log('\na long brief is not silently cut');
{
  t(`MAX_CONCEPT_CHARS is generous (${gw.MAX_CONCEPT_CHARS})`, gw.MAX_CONCEPT_CHARS >= 20000,
    'a truncated brief builds a different game from the one described');
  /* It must still be bounded. A 200,000-character design document pasted into
     the build prompt is what produced "a complete file with no canvas at all". */
  t('but it is still bounded', gw.MAX_CONCEPT_CHARS <= 60000);
  t('and the overflow is explained to the model rather than dropped',
    typeof gw.conceptForBuild === 'function' &&
    gw.conceptForBuild('x'.repeat(gw.MAX_CONCEPT_CHARS + 500)).includes('PLAYABLE CORE LOOP'),
    'silently truncating a brief builds the wrong game with no way to tell');
}

console.log('\nthe hold can cover what a long build settles to');
{
  /* A hold is a reservation, not a price: charge-on-accept settles it to the
     metered actual and returns the rest. A hold BELOW the settlement means the
     charge cannot collect — the build is given away. A hold below the cost of
     starting means the build is refused before it begins, which is the "stops
     midway" failure arriving early. */
  t(`the 3D hold rose with the budgets (${gw.FORGE_GAME_3D_ACU_CHARGE})`,
    gw.FORGE_GAME_3D_ACU_CHARGE >= 600,
    '32k output tokens can meter well above the old 250 hold');
  t(`the 2D hold rose too (${gw.FORGE_GAME_ACU_CHARGE})`, gw.FORGE_GAME_ACU_CHARGE >= 400);
  t('3D still holds more than 2D', gw.FORGE_GAME_3D_ACU_CHARGE > gw.FORGE_GAME_ACU_CHARGE);
  t('the metered floor is still below the hold', gw.FORGE_MIN_CHARGE < gw.FORGE_GAME_ACU_CHARGE);

  /* A tester wallet must still afford several runs, or the one account that can
     test the forge cannot test it more than once. */
  const pay = require('./build/shared/payments.js');
  const runs = Math.floor(pay.TESTER_CEILING_ACU / gw.FORGE_GAME_3D_ACU_CHARGE);
  t(`a tester wallet still affords several 3D forges (${runs})`, runs >= 8,
    `TESTER_CEILING_ACU ${pay.TESTER_CEILING_ACU} / hold ${gw.FORGE_GAME_3D_ACU_CHARGE}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
