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
/**
 * How many models in the library actually carry animation clips.
 *
 * This used to count the .glb files in kenney-characters — eight blocky static
 * figures that have nothing to do with the animated claim — and then assert that
 * the string "8" appeared somewhere in the feature text. It passed for weeks
 * because LIBRARY.animated was 281 and "281" contains an 8, so the check was
 * satisfied by a digit inside an unrelated number. When the count moved to 291
 * it failed, which is the first true thing it ever said.
 *
 * The claim being guarded is "Includes <n> rigged, textured, animated
 * characters", and the only honest source for n is the manifest: a model has
 * clips or it does not, measured by validate-models.mjs in a real browser.
 */
function countAnimatedModels() {
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'frontend/assets/models3d/manifest.json'), 'utf8'));
  let n = 0;
  for (const p of Object.values(m.packs || {})) {
    for (const entry of (Array.isArray(p) ? p : p.models || [])) {
      if (entry.clips && entry.clips.length) n++;
    }
  }
  return n;
}

const models = countModels(), sprites = countSprites();
t(`claims ${models} 3D models, and there are ${models}`,
  all.includes(models.toLocaleString('en-GB')) || all.includes(String(models)),
  'update _features.ts or the site is publishing a wrong number');
t(`claims ${sprites} sprites, and there are ${sprites}`,
  all.includes(sprites.toLocaleString('en-GB')) || all.includes(String(sprites)));
t(`claims ${countPacks()} model packs`, all.includes(String(countPacks())));
/* Compared against LIBRARY.animated directly, not by hunting the number in the
   prose — a substring search for a bare integer is satisfied by any digit of any
   other figure, which is exactly how this check slept through two releases. */
{
  const measured = countAnimatedModels();
  t(`claims ${F.LIBRARY.animated} animated models, and ${measured} carry clips`,
    F.LIBRARY.animated === measured,
    'update LIBRARY.animated in api/_features.ts, or re-run tools/validate-models.mjs --write');
  t('and the published proof text quotes that figure',
    all.includes(String(F.LIBRARY.animated)),
    'the claim is generated from LIBRARY.animated, so a mismatch means the text was hard-coded');
}

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

/* ------------------------------------------------------------------ *
 * Claims about things that do not exist.
 *
 * Four public pages stated as present fact that the Arcade shelf "ships
 * inside the JOSHRIX Arcade apps on Google Play and the App Store". There is
 * no app project in this repository at all, so those apps do not exist, and a
 * visitor reading that was being told something untrue about the product they
 * were being asked to pay for. It is the same class as the homepage promising
 * "the first one is free" to accounts created with zero ACUs.
 *
 * This asserts the two together: the claim is absent, AND it is absent because
 * nothing implements it. If an app project is ever added, this test starts
 * failing and the copy can go back with it.
 * ------------------------------------------------------------------ */
console.log('\n== the site does not claim things that do not exist ==');
{
  const front = path.join(REPO, 'frontend');
  const api = path.join(REPO, 'api');

  const hasAppProject =
    fs.existsSync(path.join(REPO, 'android')) ||
    fs.existsSync(path.join(REPO, 'ios')) ||
    fs.existsSync(path.join(REPO, 'capacitor.config.ts')) ||
    fs.existsSync(path.join(REPO, 'capacitor.config.json')) ||
    fs.readdirSync(api).some((f) => /capacitor|twa|apk|playstore|appstore/i.test(f));
  t('there is still no Android or iOS app project in the repo', !hasAppProject,
    'if one was added, restore the store-app copy along with it');

  const claims = [];
  for (const f of fs.readdirSync(front).filter((x) => x.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(front, f), 'utf8');
    if (/Arcade apps on Google Play|apps on Google Play and the App Store/i.test(src)) claims.push(f);
    if (/deployment to every target marketplace/i.test(src)) claims.push(f + ' (Steam/CDN claim)');
  }
  t('no page claims the store apps already exist', claims.length === 0, claims.join(', '));

  /* The priced store lanes are NOT this. /api/distribution records a real
     request, takes no money, and the copy describes a service done by hand -
     selling a manual service is honest. Assert the endpoint is really there,
     because THAT is what makes the difference. */
  t('the store lanes are backed by a real request queue',
    fs.existsSync(path.join(api, 'distribution.ts')));
  t('and that queue takes no money at the point of request',
    !/stripe|checkoutUrl|payment/i.test(fs.readFileSync(path.join(api, 'distribution.ts'), 'utf8')));

  /* The homepage promise that a public signup is refused by the platform's own
     rules. Fixed 22 Aug; asserted so it cannot return. */
  const idx = fs.readFileSync(path.join(front, 'index.html'), 'utf8');
  t('the homepage does not promise a free first forge',
    !/first one is free/i.test(idx),
    'a public signup is created with zero ACUs and a forge holds 150-250');
}


/* =========================================================================
 * EVERY FEATURE MUST BE SELLABLE, NOT JUST DESCRIBABLE.
 *
 * `proof` is the factual base an article may state. It is not a reason to buy,
 * and a blog built only on it reads like documentation: accurate, complete and
 * unpersuasive. `usp` is the selling material — the edge, the reader's
 * objection, the alternative they use today — and it lives in _features.ts so
 * that a post, the hub, an advert and a newsletter all make the SAME argument.
 *
 * These assertions exist because positioning copy is the easiest thing in the
 * repository to let rot: nothing breaks when it goes stale or starts promising
 * income, and the blog agent will happily publish whatever it is handed.
 * ========================================================================= */
console.log('\n== every feature carries a USP, and it obeys the selling rules ==');
{
  const parts = ['edge', 'objection', 'insteadOf'];
  for (const f of F.FEATURES) {
    t(`${f.id}: has a usp`, !!f.usp, 'a feature with no USP produces a post that sells nothing');
    if (!f.usp) continue;
    for (const k of parts) {
      t(`${f.id}: usp.${k} is a real sentence`,
        typeof f.usp[k] === 'string' && f.usp[k].trim().length >= 25,
        JSON.stringify(f.usp[k]));
    }
    /* The edge must not merely restate the feature name — that is the failure
       mode this field exists to prevent. */
    t(`${f.id}: the edge is not a restatement of the name`,
      f.usp.edge.toLowerCase().replace(/[^a-z]/g, '') !== f.name.toLowerCase().replace(/[^a-z]/g, ''));
  }

  const uspText = F.FEATURES.filter((f) => f.usp)
    .map((f) => [f.usp.edge, f.usp.objection, f.usp.insteadOf].join(' ')).join(' ');

  /* THE RULE THAT MATTERS MOST. Four of these features touch money, and an
     income claim is both a compliance problem and a lie this platform cannot
     support: no creator has earned anything yet. A fee may be stated as what
     the platform charges; what someone will make may never be stated at all.

     The patterns target the INCOME SENSE, not the vocabulary. A hold that
     "returns" when it settles is a refund described correctly, and an earlier
     draft of this check failed on exactly that — a test that punishes accurate
     copy gets the copy changed, which is the wrong repair. So "good returns"
     and "return on investment" are caught while a refund returning is not. */
  t('no USP implies an earning, an income or a return',
    !/\b(you (will|can|could) (earn|make|profit)|earn(ing)?s? (from|on|with)|make money|side income|passive income|get paid more|guaranteed|overnight|(great|good|strong|high|healthy|better) returns|return on investment|\bROI\b)/i.test(uspText),
    (uspText.match(/\b(earn[a-z]*|make money|income|profit[a-z]*|returns?)\b/i) || [''])[0]);
  t('no USP invents a comparative statistic',
    !/\b\d{1,3}% (faster|better|more|higher|cheaper)\b|\b\d+x (faster|better|more)\b/i.test(uspText));
  t('no USP uses fake urgency', !/\b(limited time|act now|only \d+ (left|spots)|hurry)\b/i.test(uspText));

  /* A competitor may be named in `proof`, where it is a published rate stated
     as fact. The USP argues about the ALTERNATIVE instead, so that the selling
     copy never depends on characterising another company. */
  t('no USP names a competitor',
    !/\b(roblox|steam|unity|unreal|godot|itch\.io|apple|google play|app store)\b/i.test(uspText),
    (uspText.match(/\b(roblox|steam|unity|unreal|godot|apple)\b/i) || [''])[0]
      + ' — argue about what the alternative costs the reader, not about who sells it');
}

console.log('\n== the blog agent actually uses the USP ==');
{
  /* The USP is only worth maintaining if the writer is handed it. A field that
     exists and is never read is the same as no field at all. */
  const agent = fs.readFileSync(path.join(REPO, 'api/blog-agent.ts'), 'utf8');
  t('the feature brief passes the edge to the writer', /f\.usp\.edge/.test(agent));
  t('and the objection', /f\.usp\.objection/.test(agent));
  t('and the alternative', /f\.usp\.insteadOf/.test(agent));
  t('the brief still forbids income claims',
    /never state or imply what a creator will earn/i.test(agent),
    'the selling brief must carry the same rule the USP copy obeys');
  t('the brief still forbids invented figures',
    /no invented statistics/i.test(agent));
  /* The fact sheet names published rates; the brief must not contradict that by
     banning every mention, or the writer is stuck between two instructions. */
  t('the competitor rule does not contradict the fact sheet',
    /fact sheet has not already named/i.test(agent),
    'proof for commission-rates names published storefront rates — a blanket ban makes the brief unfollowable');

  /* Every capability must be ON the calendar, or it is a feature nobody will
     ever read a page about. */
  let topics = null;
  try { topics = require('./build/api/blog-agent.js').allTopics(); } catch { /* optional */ }
  if (topics) {
    const missing = F.FEATURES.filter((f) => !topics.includes(`FEATURE:${f.id}`)).map((f) => f.id);
    t(`every feature has a slot on the blog calendar (${F.FEATURES.length})`,
      missing.length === 0, missing.join(', '));
    t('the calendar interleaves features with editorial rather than running 21 product pages',
      topics.filter((x) => !x.startsWith('FEATURE:')).length > 0);
  }
}


console.log('\n== the feature-blog seeder reads the same list the module exports ==');
{
  /* tools/seed-feature-blog.mjs publishes one article per feature by parsing
     api/_features.ts as TEXT, because it is a plain Node script and that file is
     TypeScript. A text parse is the right call here — the alternative was an
     experimental Node flag in a tool run from a laptop — but it is also the kind
     of thing that quietly stops matching. If the shape of _features.ts changes,
     the seeder would publish articles for nineteen of twenty-one features and
     report success, so the parse is checked against the real export. */
  let readFeatures = null;
  try { ({ readFeatures } = require('../tools/seed-feature-blog.mjs')); } catch { /* ESM */ }
  if (!readFeatures) {
    /* The tool is ESM and this suite is CJS; re-implement nothing — read the
       file and assert the parse the tool uses finds every id. */
    const src = fs.readFileSync(path.join(REPO, 'api/_features.ts'), 'utf8');
    const ids = src.split(/\n  \{\n/).slice(1)
      .map((b) => (b.match(/^\s*id: "([^"]+)"/m) || [])[1]).filter(Boolean);
    const missing = F.FEATURES.map((f) => f.id).filter((id) => !ids.includes(id));
    t(`the seeder's parse finds every feature (${ids.length})`,
      missing.length === 0 && ids.length === F.FEATURES.length,
      missing.length ? 'missed: ' + missing.join(', ') : `parsed ${ids.length}, exported ${F.FEATURES.length}`);

    const groups = src.split(/\n  \{\n/).slice(1)
      .map((b) => (b.match(/^\s*group: "([^"]+)"/m) || [])[1]).filter(Boolean);
    t('and a group for each one', groups.length === F.FEATURES.length,
      `${groups.length} groups for ${F.FEATURES.length} features`);

    const edges = src.split(/\n  \{\n/).slice(1)
      .map((b) => (b.match(/^\s*edge: "/m) ? 1 : 0)).reduce((a, b) => a + b, 0);
    t('and a usp.edge for each one', edges === F.FEATURES.length,
      `${edges} edges for ${F.FEATURES.length} features`);
  }

  const tool = fs.readFileSync(path.join(REPO, 'tools/seed-feature-blog.mjs'), 'utf8');
  t('the seeder drives the real endpoint rather than writing posts itself',
    /\/api\/blog-agent/.test(tool) && !/<h2>/.test(tool),
    'an article written by the tool would skip the SEO gate entirely');
  t('it asks for the FEATURE topic, so the USP brief is the one used',
    /topic: `FEATURE:\$\{f\.id\}`/.test(tool));
  t('a draft refused by the gate is reported, never republished thin',
    /422/.test(tool) && /not published/.test(tool));
  t('it has a dry run, because the live one spends money',
    /--dry-run/.test(tool) && /DRY/.test(tool));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
