/**
 * ONE BACKEND, ONE GATEWAY, ONE COPY OF EVERY PUBLISHED SPEC.
 *
 * The repository carried THREE backends. `api/` (62 modules, the ledger, the
 * paywall, every test) is the live one and is the only one `vercel.json` and the
 * frontend ever reach. Alongside it sat:
 *
 *   functions/         a Firebase Cloud Functions codebase exposing nine routes
 *                      `api/` already had — including its OWN /stripe-webhook,
 *                      with no ledger behind it. Deploying it would have stood up
 *                      a second system able to take card payments and record
 *                      nothing. It was buildable (its package.json copies
 *                      ../shared in at build time), which made it more dangerous
 *                      rather than less.
 *   backend/ai-gateway a third copy of the AI gateway, which api/_gateway.ts
 *                      pointed at in a comment as though it were authoritative.
 *
 * CLAUDE.md is explicit: "The AI gateway already does model routing,
 * three-provider fallback, token metering, cost control, quality gates and a
 * security scan. Extend it. Never add a second path to a model provider." There
 * were three paths.
 *
 * This file stops them coming back, and guards the one duplication that IS
 * deliberate: docs/ is not deployed (vercel.json sets outputDirectory to
 * frontend), so frontend/specs/ holds published copies. Those are a publishing
 * mechanism, not an accident — but byte-identical copies drift silently, and a
 * spec that has gone stale on the public site is worse than one that was never
 * published.
 *
 *   node tests/t42-one-backend.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

console.log('\nthere is exactly one backend');
{
  for (const dead of ['functions', 'backend']) {
    t(`${dead}/ is gone`, !fs.existsSync(path.join(ROOT, dead)),
      'a second backend that can take payments is a money-safety hazard, not clutter');
  }
  /* firebase.json is BACK, deliberately and much smaller. The dangerous part was
     never the file — it was the `functions` codebase it declared. Firebase is
     still the identity provider and still holds users/{uid}, so the rules for
     that collection need somewhere to be declared and versioned. What must not
     return is a second deployable backend; tests/t43 asserts the file carries no
     functions or hosting block. */
  t('firebase.json declares Firestore rules and nothing else', (() => {
    const p = path.join(ROOT, 'firebase.json');
    if (!fs.existsSync(p)) return false;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return !!j.firestore && !j.functions && !j.hosting;
  })(), 'a functions codebase here is a second payment path');
  t('api/ is present and is the real one',
    fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.ts')).length > 50);

  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  t('vercel.json serves the frontend', vercel.outputDirectory === 'frontend');
  t('and clean URLs are on', vercel.cleanUrls === true);
}

console.log('\nthere is exactly one path to a model provider');
{
  /* Any file that talks to a provider endpoint directly. api/_gateway.ts is the
     only one allowed to — everything else must route through it. */
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.testbuild') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|js|mjs)$/.test(e.name)) continue;
      const src = fs.readFileSync(full, 'utf8');
      if (/api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.openai\.com/.test(src)) {
        hits.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, 'api'));
  if (fs.existsSync(path.join(ROOT, 'shared'))) walk(path.join(ROOT, 'shared'));
  if (fs.existsSync(path.join(ROOT, 'tools'))) walk(path.join(ROOT, 'tools'));

  /* ONE EXCEPTION, and it is a real one. api/provider-selftest.ts must reach
     each provider INDEPENDENTLY — the gateway's chain stops at the first
     success, so it can never tell you that provider two is broken while
     provider one is healthy, which is the entire question the probe answers.
     The rule CLAUDE.md states is about product work: no second path that can
     put generated content in front of a user. A diagnostic that sends "say OK"
     and reports latency is not that, so it is allowed BY NAME rather than by
     loosening the check — and the assertion below keeps it a probe. */
  const ALLOWED = [path.join('api', '_gateway.ts'), path.join('api', 'provider-selftest.ts')];
  const unexpected = hits.filter((h) => !ALLOWED.includes(h));
  t('no unsanctioned path to a model provider', unexpected.length === 0,
    unexpected.join(', '));
  t('the gateway is still the one that does product work', hits.includes(ALLOWED[0]),
    'has the gateway moved?');

  const probe = fs.readFileSync(path.join(ROOT, 'api/provider-selftest.ts'), 'utf8');
  t('the self-test stays a probe and never generates a build',
    !/generateGameHtml|generateBlueprint|buildPlayable/.test(probe),
    'the moment it can produce content for a user it is a second gateway');
}

console.log('\nno document points at something that was removed');
{
  const stale = [];
  const docs = [path.join(ROOT, 'docs'), ROOT];
  for (const dir of docs) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const full = path.join(dir, f);
      if (!fs.statSync(full).isFile()) continue;
      const src = fs.readFileSync(full, 'utf8');
      /* A doc explaining WHY these were removed has to name them, so a mention
         is not automatically a stale pointer. The old filter judged one LINE at
         a time, which cannot work: STATUS.md names both backends in a bullet
         list and states "Both are removed" three lines further down, so the
         explanation and the exoneration are never on the same line.
         Judge by SECTION instead — a markdown heading to the next heading is
         the unit a reader actually takes meaning from. A section that says the
         thing is gone is a history note; one that names it with no such
         sentence is still pointing at it. */
      const sections = src.split('\n')
        .filter((l) => !l.trimStart().startsWith('>'))
        .join('\n')
        .split(/\n(?=#{1,6}\s)/);
      const stillPointing = sections.filter((s) =>
        /backend\/ai-gateway|firebase deploy --only functions|`functions\//.test(s) &&
        !/NOT IMPLEMENTED|\b(removed|deleted|gone|no longer)\b|Corrected|git history/i.test(s));
      if (stillPointing.length) stale.push(path.relative(ROOT, full));
    }
  }
  t('no doc still instructs a Firebase Functions deploy', stale.length === 0, stale.join(', '));
}

console.log('\nthe published spec copies have not drifted from source');
{
  const specs = path.join(ROOT, 'frontend', 'specs');
  t('frontend/specs exists — it is what /docs serves', fs.existsSync(specs));
  const hash = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
  let checked = 0;
  for (const f of fs.readdirSync(specs)) {
    if (!f.endsWith('.md')) continue;
    const source = path.join(ROOT, 'docs', f);
    if (!fs.existsSync(source)) {
      t(`${f}: has a source in docs/`, false, 'a published spec with no source cannot be maintained');
      continue;
    }
    checked++;
    t(`${f}: published copy matches docs/${f}`, hash(path.join(specs, f)) === hash(source),
      'docs/ is not deployed, so this copy IS the public document — regenerate it');
  }
  t('there were copies to check', checked > 5, `${checked}`);

  /* The brand guidelines are the same arrangement: the press kit links the
     deployed copy, and the repo copy is the source. */
  const b1 = path.join(ROOT, 'branding', 'BRANDING.md');
  const b2 = path.join(ROOT, 'frontend', 'branding', 'BRANDING.md');
  t('the deployed BRANDING.md matches the source', hash(b1) === hash(b2),
    'press.html links the deployed copy; a stale one publishes the wrong palette');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
