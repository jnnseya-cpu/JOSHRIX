/**
 * THE FIRESTORE RULES ARE IN THE REPOSITORY, AND THEY ARE NOT PERMISSIVE.
 *
 * frontend/assets/store.js reads and writes users/{uid} from the browser on six
 * pages — profile, signup, studio, dashboard, growth and admin — and until
 * 11 Sep 2026 this repository contained NO Firestore rules at all. Whatever was
 * protecting that data lived only in the Firebase console: unversioned,
 * unreviewable, and absent from every code review.
 *
 * That matters because a Firestore database created in test mode defaults to
 * `allow read, write: if true`. From outside the console, "nobody ever checked"
 * and "every user's email, name, country and bio is world-readable and
 * world-writable" are indistinguishable.
 *
 * This file cannot reach Firebase, so it does not claim to prove the DEPLOYED
 * rules are correct — only Justin running `firebase deploy --only
 * firestore:rules` makes the file below the live ones, and the console's Rules
 * Playground is what verifies them against real requests. What it does prove is
 * that a correct, least-privilege ruleset is versioned here, that it cannot
 * silently become permissive, and that the client is not relying on a collection
 * the rules do not cover.
 *
 *   node tests/t43-firestore-rules.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const RULES_PATH = path.join(ROOT, 'firestore.rules');

console.log('\nthe rules are versioned, not console-only');
{
  t('firestore.rules exists', fs.existsSync(RULES_PATH),
    'rules that live only in the console are absent from every code review');
  t('firebase.json declares them', (() => {
    const p = path.join(ROOT, 'firebase.json');
    if (!fs.existsSync(p)) return false;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.firestore && j.firestore.rules === 'firestore.rules';
  })(), 'without the declaration `firebase deploy` does not know what to ship');
  t('firebase.json no longer declares a second backend', (() => {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
    return !j.functions && !j.hosting;
  })(), 'the backend is Vercel; a functions codebase here is a second payment path');
}

if (!fs.existsSync(RULES_PATH)) {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

/* Comments explain the reasoning and necessarily quote the dangerous pattern
   they warn about. Judge the rules, not the prose about them. */
const raw = fs.readFileSync(RULES_PATH, 'utf8');
const rules = raw.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

console.log('\nnothing is open to the world');
{
  t('no `allow read, write: if true`', !/allow\s+[a-z,\s]*:\s*if\s+true\s*;/.test(rules),
    (rules.match(/allow[^;]*if\s+true\s*;/) || [''])[0]);
  t('no unconditional allow of any verb',
    !/allow\s+(read|write|get|list|create|update|delete)[a-z,\s]*:\s*if\s+true/.test(rules));
  t('rules_version 2 is declared', /rules_version\s*=\s*'2'/.test(raw),
    'v1 evaluates recursive wildcards differently and is long deprecated');
  t('there is an explicit catch-all denial',
    /match\s*\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false/.test(rules),
    'a careless broad match added above it should be visible in a diff, not invisible');
}

console.log('\na profile is reachable only by its owner');
{
  const block = (rules.match(/match\s*\/users\/\{uid\}\s*\{([\s\S]*?)\}/) || [, ''])[1];
  t('users/{uid} has a rule at all', block.trim().length > 0,
    'store.js writes this collection from six pages');
  t('it requires authentication', /request\.auth\s*!=\s*null/.test(block));
  t('it requires the caller to BE that user', /request\.auth\.uid\s*==\s*uid/.test(block),
    'without the uid comparison any signed-in user reads every profile');
}

console.log('\nthe rules cover what the client actually touches');
{
  /* A collection the client uses with no matching rule is denied by default,
     which is safe but breaks the feature silently. The reverse — a rule for a
     collection nobody uses — is dead surface. Both are worth catching. */
  const clientSrc = fs.readFileSync(path.join(ROOT, 'frontend/assets/store.js'), 'utf8');
  const used = new Set([...clientSrc.matchAll(/\.collection\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]));
  t('the client uses exactly the collections we think it does',
    used.size === 1 && used.has('users'), [...used].join(', '));
  for (const c of used) {
    t(`${c}: has a rule block`, new RegExp(`match\\s*/${c}/`).test(rules),
      'the client would fail closed against the catch-all denial');
  }
}

console.log('\nthe data that matters is not in Firestore at all');
{
  /* The rules are a confidentiality control, not a money control, and that is by
     design: money, ownership and entitlement live in Neon Postgres behind
     api/_ledger.ts. If any of that ever migrates into Firestore these rules stop
     being sufficient, so assert the boundary rather than assume it. */
  /* Strip comments first. _ledger.ts opens by stating the rule it obeys —
     "money lives in Postgres, never solely Firestore" — and a checker that reads
     its own explanation as evidence reports the defect it documents. That trap
     has now appeared four times in this suite; it is cheap to avoid and
     expensive to debug. */
  const code = (p) => fs.readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');

  const led = code(path.join(ROOT, 'api/_ledger.ts'));
  t('the ledger is Postgres, not Firestore',
    /neon|postgres/i.test(led) && !/firestore/i.test(led));

  const serverFiles = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.ts'));
  const firestoreOnServer = serverFiles.filter((f) =>
    /firestore/i.test(code(path.join(ROOT, 'api', f))));
  t('no server endpoint reads or writes Firestore', firestoreOnServer.length === 0,
    firestoreOnServer.join(', '));

  /* The profile carries accountType, and a client can set it to anything. It is
     only safe because the server never reads it. */
  const trusts = serverFiles.filter((f) => /accountType/.test(code(path.join(ROOT, 'api', f))));
  t('no server endpoint trusts the client-set accountType', trusts.length === 0,
    trusts.join(', ') + ' — a client-writable field must never grant privilege');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
