/**
 * THE KEY STATUS BOARD MUST NEVER BECOME A KEY STORE, OR A KEY LEAK.
 *
 * Justin asked for all required API keys to be set up in the admin account. The
 * endpoint built for that reports what is missing and how to set it; it does not
 * accept or return a value. That distinction is the whole security design, and
 * it is one refactor away from being lost by someone trying to be helpful — so
 * it is asserted here rather than left to the comment that explains it.
 *
 * The other half of this file guards drift. .env.example is already a contract:
 * tests/t32 asserts every variable the code reads is declared there and every
 * declared variable is read. This registry is the presentation layer over that
 * contract, so it has to cover exactly the same set. Without this, a new key
 * would appear in the admin panel as a bare name with no explanation, or — worse
 * — a key the platform genuinely needs would never appear at all and the owner
 * would have no way to know it was missing.
 *
 *   node tests/t46-key-registry.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JOSHRIX_ROOT || path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const reg = require('./build/api/_keyregistry.js');
const KEYS = reg.KEYS;

console.log('\nthe registry covers exactly what .env.example declares');
{
  const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  const declared = new Set(
    example.split('\n')
      .map((l) => (l.match(/^([A-Z][A-Z0-9_]+)=/) || [])[1])
      .filter(Boolean));
  const covered = new Set(KEYS.map((k) => k.env));

  const missing = [...declared].filter((d) => !covered.has(d));
  const extra = [...covered].filter((c) => !declared.has(c));

  t(`.env.example declares ${declared.size} variables`, declared.size > 20, String(declared.size));
  t('every declared variable has registry metadata', missing.length === 0,
    missing.join(', ') + ' — it would show in /admin as a name with no explanation');
  t('the registry invents no variable the code does not read', extra.length === 0,
    extra.join(', ') + ' — t32 proves .env.example matches the code, so an extra here is fiction');
  t('and the two sets are the same size', declared.size === covered.size,
    `${declared.size} declared vs ${covered.size} in the registry`);
}

console.log('\nevery entry actually explains itself');
{
  const NEEDS = ['required', 'recommended', 'optional', 'cosmetic'];
  for (const k of KEYS) {
    t(`${k.env}: has a valid need`, NEEDS.includes(k.need), String(k.need));
    t(`${k.env}: says what it powers`, typeof k.powers === 'string' && k.powers.length > 15);
    /* The consequence field is the one an owner actually acts on: "what happens
       while this is missing" is the difference between a list and a decision. */
    t(`${k.env}: says what happens without it`, typeof k.without === 'string' && k.without.length > 15);
  }
}

console.log('\nthe money and platform keys are marked required, not optional');
{
  /* These are not a judgement call. Each one has a specific, known consequence
     that stops the business, and marking any of them optional would hide it. */
  const mustBeRequired = ['DATABASE_URL', 'MODERATION_KEY', 'CRON_SECRET',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PAYOUT_SECRET'];
  for (const env of mustBeRequired) {
    const k = KEYS.find((x) => x.env === env);
    t(`${env} is required`, k && k.need === 'required', k ? k.need : 'absent');
  }
  /* The webhook secret is the subtlest money failure on the platform: payment
     succeeds and the customer receives nothing, because credit is applied only
     from a verified webhook. The registry must say that, not just "required". */
  const wh = KEYS.find((x) => x.env === 'STRIPE_WEBHOOK_SECRET');
  t('and the webhook secret explains the silent failure',
    /grants nothing|gets no ACU|no ACUs/i.test(wh.without), wh.without);
}

console.log('\nthe three AI providers are a chain, not three requirements');
{
  const sets = reg.oneOfSets();
  t('there is an AI one-of set', Array.isArray(sets.ai) && sets.ai.length === 3, JSON.stringify(sets.ai));
  t('and a mail one-of set', Array.isArray(sets.mail) && sets.mail.length >= 2, JSON.stringify(sets.mail));
  t('the AI set is the three real providers',
    ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY'].every((e) => sets.ai.includes(e)));
}

console.log('\nthe keys that buy nothing are labelled as buying nothing');
{
  /* .env.example calls these REPORTING ONLY: they are read in exactly one place
     and flip a boolean on /api/health. An owner reading an admin panel must not
     be sent to buy a text-to-3D subscription for a feature that does not exist. */
  for (const env of ['IMAGE_GEN_API_KEY', 'MESHY_API_KEY', 'TRIPO_API_KEY', 'ELEVENLABS_API_KEY']) {
    const k = KEYS.find((x) => x.env === env);
    t(`${env} is marked cosmetic`, k && k.need === 'cosmetic', k ? k.need : 'absent');
    t(`${env} says plainly that it changes nothing`,
      k && /nothing/i.test(k.powers) && /nothing/i.test(k.without), k ? k.powers : '');
  }
}

console.log('\nTHE ENDPOINT CANNOT LEAK A KEY AND CANNOT STORE ONE');
{
  /* Comments here necessarily discuss values and storing; judge the code. */
  const src = fs.readFileSync(path.join(ROOT, 'api/admin-keys.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  t('it is read-only — GET and nothing else',
    /req\.method !== "GET"/.test(src) && !/req\.method === "POST"/.test(src),
    'a POST here would move every platform credential into a database row');
  t('it never puts a raw env value in the response',
    !/value:\s*raw|raw\s*\}|\.\.\.process\.env|value:\s*process\.env/.test(src),
    'SET or MISSING is the contract');
  t('not even a prefix or a suffix',
    !/\braw\.slice\(|\braw\.substring\(|\braw\.slice\b/.test(src),
    'several providers encode account data in a key prefix');
  t('the fingerprint is a one-way hash, not a truncated key',
    /createHash\("sha256"\)\.update\(v\)/.test(src),
    'it exists to confirm a rotation, and must be impossible to reverse');
  t('it fails closed when no admin key is configured',
    /if \(!adminKey\) return res\.status\(503\)/.test(src));
  t('a wrong admin key is refused with 401',
    /status\(401\)/.test(src));
  t('and a refused attempt is recorded',
    /recordSecurityEvent/.test(src),
    'this endpoint enumerates the platform credentials; a probe against it is a signal');

  /* The registry must not grow a field that holds a value. */
  const regSrc = fs.readFileSync(path.join(ROOT, 'api/_keyregistry.ts'), 'utf8');
  t('the registry stores metadata only, never a value',
    !/\bvalue\s*:/.test(regSrc) && !/\bdefaultValue\b/.test(regSrc),
    'a default in here would be a secret in the repository');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
