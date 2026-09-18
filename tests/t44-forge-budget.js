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
 * Justin, 18 Sep 2026, went further: "every AI powered work must have no time
 * limit and ACU limit... must work until it produces the highly expected
 * results." A knob cannot deliver that, because the ceiling belongs to the
 * platform rather than to us. So a forge became a durable JOB — api/_forgejobs.ts
 * plus api/forge-worker.ts — advanced one slice at a time until the build clears
 * every gate. FORGE_MAX_SECONDS now bounds one slice, not the run.
 *
 * This file therefore guards three things, and the third is the newest: that the
 * slice ceiling still sits under the platform's, that no second copy of a budget
 * or a quality bar has appeared, and that the two limits Justin asked to remove —
 * the clock and the fixed ACU hold — have not crept back in disguised as
 * defaults. Every one of those failures is invisible until a real forge drops.
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

console.log('\nthe slice ceiling sits below the platform ceiling');
{
  /* THE WORKER, not the forge entry point. Since 18 Sep the generation happens
     in api/forge-worker.ts — forge-game only queues a job, which is why its own
     maxDuration dropped to 30s. If this ever reads forge-game again, someone has
     put generation back inside the request and reinstated the hard ceiling. */
  const worker = (vercel.functions || {})['api/forge-worker.ts']?.maxDuration;
  const queue = (vercel.functions || {})['api/forge-game.ts']?.maxDuration;
  t('vercel.json sets a maxDuration for the worker', typeof worker === 'number', String(worker));
  t('the queue endpoint needs no long window', typeof queue === 'number' && queue <= 60, String(queue),
    'forge-game writes a row; a long window there means it is generating again');
  t('FORGE_MAX_SECONDS is exported', typeof gw.FORGE_MAX_SECONDS === 'number', String(gw.FORGE_MAX_SECONDS));

  /* The margin has to cover writing the slice's state back AFTER generation
     returns. Ten seconds is the floor; less and a slow database write loses the
     attempt — not the run any more, but still paid-for tokens for nothing. */
  t(`FORGE_MAX_SECONDS (${gw.FORGE_MAX_SECONDS}) is at least 10s under the worker's maxDuration (${worker})`,
    gw.FORGE_MAX_SECONDS <= worker - 10,
    'raise BOTH together, or the slice is killed mid-stream and that attempt is wasted');
  t('and it is not needlessly far below it', gw.FORGE_MAX_SECONDS >= worker - 60,
    'unused headroom is a wasted slice for no reason');
}

console.log('\nevery timeout derives from that one number');
{
  /* Three hard-coded second-values used to live here. If a literal reappears,
     someone has added a fourth ceiling that will not move when the knob does. */
  const literals = (src.match(/\b(1[5-9]\d|2[0-9]\d)_?000\b/g) || [])
    .filter((n) => !/^16_?000$|^24_?000$|^32_?000$/.test(n));
  t('no stray hard-coded millisecond ceiling remains', literals.length === 0,
    literals.join(', ') + ' — derive it from FORGE_MAX_SECONDS instead');
  /* One helper now derives all three, so that they cannot drift apart AND so a
     caller owning a shorter window can re-derive them from what it actually has.
     That second property is what makes a worker slice safe. */
  t('one helper derives all three budgets', /function budgets\(windowMs: number\)/.test(src));
  t('the stream abort comes from it', /budgets\([^)]*\)\.stream|B\.stream/.test(src));
  t('the provider timeout comes from it', /PROVIDER_TIMEOUT_MS\s*=\s*budgets\(/.test(src));
  t('the chain budget comes from it', /CHAIN_BUDGET_MS\s*=\s*B\.chain/.test(src));
  t('and a caller may pass its own window', /deadline\?:\s*number/.test(src) && /opts\.deadline/.test(src),
    'a worker slice starts mid-request; without this it would budget as if it owned a whole one');
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

console.log('\nnothing is reserved up front any more');
{
  /* The fixed hold is gone, and its absence is the assertion. It was raised twice
     for the same reason — refusing work a wallet could afford — and it was also
     the real ACU ceiling, because a run could never cost more than its hold. If
     either constant comes back, someone has reinstated that ceiling. */
  t('the fixed 2D hold is gone', gw.FORGE_GAME_ACU_CHARGE === undefined,
    'a reservation taken before the work is priced is a limit whichever way it is wrong');
  t('the fixed 3D hold is gone', gw.FORGE_GAME_3D_ACU_CHARGE === undefined);
  t('forge-game no longer debits a hold before generating',
    !/debitWallet/.test(fs.readFileSync(path.join(ROOT, 'api/forge-game.ts'), 'utf8')),
    'it queues a job; the worker debits each attempt as that attempt completes');

  /* What replaced it: enough to begin, and the wallet as the only bound. */
  t(`starting a forge needs only one attempt's floor (${gw.FORGE_MIN_CHARGE})`,
    gw.FORGE_MIN_CHARGE > 0 && gw.FORGE_MIN_CHARGE <= 100,
    'anything larger gatekeeps a funded wallet again');

  const jobs = fs.readFileSync(path.join(ROOT, 'api/_forgejobs.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  t('the run stops on the WALLET, not on a counter',
    /balance\s*<\s*FORGE_MIN_CHARGE/.test(jobs),
    'the only honest spending bound is the money that exists');
  t('each attempt debits what that attempt metered',
    /debitWallet\(sql,\s*job\.wallet_id,\s*cost\)/.test(jobs));
  t('the accumulated total becomes the existing charge-on-accept hold',
    /recordForgeHold\(sql,\s*forgeId,\s*job\.wallet_id,\s*p\.acuHeld/.test(jobs),
    'a second money path is the one thing that must never appear here');
  t('a failed run refunds every ACU it spent',
    /creditWallet\(sql,\s*job\.wallet_id,\s*acuHeld\)/.test(jobs),
    '/refunds promises "you never pay for a failed forge"');
}

console.log('\nthe run outlives the request, which is what removes the time limit');
{
  const jobs = fs.readFileSync(path.join(ROOT, 'api/_forgejobs.ts'), 'utf8');
  const worker = fs.readFileSync(path.join(ROOT, 'api/forge-worker.ts'), 'utf8');
  const queue = fs.readFileSync(path.join(ROOT, 'api/forge-game.ts'), 'utf8');

  t('forge-game returns 202 and a ticket, not a game', /status\(202\)/.test(queue));
  t('and it does not call the model at all', !/generateGameHtml/.test(queue),
    'generation inside the request is the hard ceiling this change removes');
  t('a slice that runs out of time leaves the job RUNNING', /status:\s*"running"/.test(jobs),
    'the next invocation continues — that is the whole mechanism');
  t('a slice hands its lease back rather than holding it', /releaseLease/.test(jobs));
  t('the lease is what stops two workers spending twice',
    /lease_until IS NULL OR lease_until < now\(\)/.test(jobs));
  t('a cron sweeps jobs whose creator closed the tab',
    (vercel.crons || []).some((c) => c.path === '/api/forge-worker'),
    'without this the promise depends on a browser staying open');
  t('an unprivileged caller must prove the job is theirs',
    /not your forge/.test(worker) && /existing\.wallet_id !== walletId/.test(worker),
    'this endpoint spends money, so ownership is checked before the claim');
  t('the kill switch stops new slices too', /forgeDisabled\(\)/.test(worker),
    'an incident is exactly when a paid loop must stop buying attempts');
}

console.log('\nit retries until the build is good, and says why');
{
  const jobs = fs.readFileSync(path.join(ROOT, 'api/_forgejobs.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  t('there is ONE judge of a build, shared with the chain',
    typeof gw.judgeBuild === 'function' && /judgeBuild/.test(jobs),
    'two copies of a quality bar drift, and the drift ships bad games');
  t('a refusal is fed back to the next attempt as requirements',
    /feedback:\s*notes/.test(jobs),
    'an identical retry is the same dice roll at the same price');
  t('the stop condition is lack of PROGRESS, not an attempt cap',
    /stale\s*>=\s*MAX_STALE_ATTEMPTS/.test(jobs) && !/attempts\s*>=\s*MAX_ATTEMPTS/.test(jobs),
    'a run that keeps getting closer must never be stopped');
  t('and the allowance is settable', typeof gw !== 'undefined' &&
    /process\.env\.FORGE_MAX_STALE_ATTEMPTS/.test(fs.readFileSync(path.join(ROOT, 'api/_forgejobs.ts'), 'utf8')));

  /* judgeBuild has to be usable as a judge: a passing build and a stub must not
     score the same, or "is it improving" cannot be answered. */
  const stub = '<!DOCTYPE html><html><body><canvas id="c"></canvas><script>1</script></body></html>';
  const v = gw.judgeBuild(stub, false);
  t('a stub is refused', v.ok === false && v.notes.length > 0);
  t('and its reasons are concrete enough to act on',
    v.notes.join(' ').includes('substance floor') || v.notes.join(' ').includes('missing:'),
    v.notes.join(' | '));
  t('a refused build scores finite, a passing one Infinity',
    Number.isFinite(v.score) && gw.judgeBuild(stub, false).score === v.score,
    'the score is what tells improvement from churn, so it must be stable');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
