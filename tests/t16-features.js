/**
 * The feature inventory is marketing copy that gets published to the open web
 * and quoted by an AI writer as fact. A number that drifts out of date becomes
 * a lie on a public page, and this platform's buyers are technical enough to
 * check.
 *
 * So the countable claims are asserted against the repository itself.
 *
 *   node tests/t16-features.js      (expects ./build/_features.js)
 */
const F = require('./build/_features.js');
const fs = require('node:fs');
const path = require('node:path');

const REPO = process.env.JOSHRIX_ROOT || path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

// Names are published copy too — the headline number often lives there ("You
// keep 75–92.5% of every sale"), so scanning proof alone would miss it.
const all = F.FEATURES.map((x) => x.name + ' ' + x.proof.join(' ')).join(' ');

console.log('\n== every published number must match the repository ==');

function countModels() {
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'frontend/assets/models3d/manifest.json'), 'utf8'));
  return Object.values(m.packs).reduce((s, p) => s + p.models.length, 0);
}
function countSprites() {
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'frontend/assets/sprites/manifest.json'), 'utf8'));
  return Object.values(m.packs).reduce((s, p) => s + p.sprites.length, 0);
}
function countPacks() {
  // From the manifest, not the directory listing: the manifest is what the forge
  // actually reads, and packs/ also holds a README and a .gitignore that are not
  // packs. Counting files there inflates the published number by two.
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'frontend/assets/models3d/manifest.json'), 'utf8'));
  return Object.keys(m.packs).length;
}
function countAnimatedChars() {
  return fs.readdirSync(path.join(REPO, 'frontend/assets/models3d/packs/kenney-characters'))
    .filter((f) => f.endsWith('.glb')).length;
}

const models = countModels(), sprites = countSprites();
t(`claims ${models} 3D models, and there are ${models}`,
  all.includes(models.toLocaleString('en-GB')) || all.includes(String(models)),
  'update _features.ts or the site is publishing a wrong number');
t(`claims ${sprites} sprites, and there are ${sprites}`,
  all.includes(sprites.toLocaleString('en-GB')) || all.includes(String(sprites)));
t(`claims ${countPacks()} model packs`, all.includes(String(countPacks())));
t(`claims ${countAnimatedChars()} animated humans`, all.includes(String(countAnimatedChars())));

console.log('\n== pricing claims must match shared/payments ==');
let plans = null;
try { plans = require('./build/shared/payments.js'); } catch { try { plans = require('./shared/payments.js'); } catch {} }
if (plans && plans.PLANS) {
  // PLANS is an array and `commission` is a fraction (0.25 … 0.075). Explorer
  // carries null because it cannot sell at all, so it is not part of the range.
  const rates = Object.values(plans.PLANS)
    .map((p) => p.commission)
    .filter((x) => typeof x === 'number');
  const lo = Math.min(...rates), hi = Math.max(...rates);
  // 92.5, not 92.5000001 — a float artefact here would publish a nonsense number.
  const pct = (x) => String(Math.round((100 - x * 100) * 10) / 10);
  t(`creators keep ${pct(hi)}-${pct(lo)}%, and the copy says so`,
    all.includes(pct(hi)) && all.includes(pct(lo)),
    `plans say creators keep ${pct(hi)}% to ${pct(lo)}%`);
  t('the commission taken is stated the same way round',
    all.includes(String(Math.round(hi * 1000) / 10)) && all.includes(String(Math.round(lo * 1000) / 10)),
    `commission runs ${hi * 100}% down to ${lo * 100}%`);
} else {
  console.log('  SKIP pricing cross-check — shared/payments not built here');
}

console.log('\n== structure ==');
t('every feature has an id, name, group, keywords, proof and href',
  F.FEATURES.every((f) => f.id && f.name && f.group && f.keywords.length && f.proof.length && f.href));
t('ids are unique', new Set(F.FEATURES.map((f) => f.id)).size === F.FEATURES.length);
t('ids are URL-safe', F.FEATURES.every((f) => /^[a-z0-9-]+$/.test(f.id)));
t('every group is one of the declared groups',
  F.FEATURES.every((f) => F.FEATURE_GROUPS.includes(f.group)));
t('every href is a site-relative path', F.FEATURES.every((f) => f.href.startsWith('/')));

console.log('\n== link targets ==');
const targets = F.featureLinkTargets();
t('produces auto-link targets', targets.length > 0);
t('no target anchor is dangerously short',
  targets.every((x) => x.title.length > 3),
  'a two-letter anchor would link half the article');
t('every target points somewhere on this site',
  targets.every((x) => x.href.startsWith('/')));

console.log('\n== honesty guardrails ==');
t('no proof line contains a percentage the repo cannot back',
  !/\b\d{2,3}% (faster|better|more|higher)\b/i.test(all),
  'vague comparative percentages are exactly the invented statistic to avoid');
t('no proof line promises an outcome',
  !/\b(guaranteed|will earn|you will make|overnight)\b/i.test(all));

console.log('\n== the hub page must not carry its own copy of the numbers ==');
{
  // The meta description is hand-written and sits outside _features.ts, so it is
  // the one place a stale number can survive every check above and still be the
  // first thing a searcher reads in the results page.
  const src = fs.readFileSync(path.join(REPO, 'api/features-hub.ts'), 'utf8');
  const desc = (src.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const nums = (desc.match(/[\d,]*\d(?:\.\d+)?/g) || []).filter((n) => n.replace(/\D/g, '').length > 1);
  const unbacked = nums.filter((n) => !all.includes(n) && !all.includes(n.replace(/,/g, '')));
  t('every number in the hub meta description is backed by a feature claim',
    unbacked.length === 0, 'unbacked: ' + unbacked.join(', '));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
