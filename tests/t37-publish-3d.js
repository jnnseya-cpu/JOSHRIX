/**
 * EVERY BUILD THE FORGE CAN PRODUCE MUST BE PUBLISHABLE.
 *
 * The Featured Worlds section on the landing page renders "No public worlds
 * yet" because the arcade is empty, and the arcade is empty because no 3D game
 * has ever been able to reach it.
 *
 * POST /api/games gated on `html.includes("<canvas")`. A build on the hosted
 * JOSHRIX3D runtime has no literal <canvas> tag anywhere in it — the runtime
 * creates the element from JavaScript, which is the whole point of a hosted
 * runtime. api/_gateway.ts already knew this: `looksPlayable()` exists with the
 * comment "3D builds create their canvas from JavaScript and used to be
 * silently rejected here", and api/forge-game.ts was moved onto it. The publish
 * endpoint was not, so the two halves of the same pipeline disagreed about what
 * a valid game is.
 *
 * The effect on a creator: forge a 3D game — the platform's flagship output and
 * the thing the entire landing page advertises — press Publish, and get
 * "`html` must be a complete forged game (doctype + canvas)". Not a crash, not
 * a 500, just a validation message that reads like their game is malformed.
 *
 * This file drives the REAL handler against the REAL engine output, because a
 * test that asserts against a hand-written fixture would have agreed with the
 * bug: the fixture would have had a <canvas> in it.
 *
 *   node tests/t37-publish-3d.js
 */
const led = require('./build/api/_ledger.js');
const gw = require('./build/api/_gateway.js');
const { buildPlayableGame } = require('./build/api/_engine.js');
const { buildPlayable3dGame } = require('./build/api/_engine3d.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/* ---------- the blueprint a forge hands the engine ---------- */
const bp = (over = {}) => ({
  language: 'en', title: 'Reef Runner', summary: 'Outswim the tide.',
  genre: ['Arcade'], coreLoop: ['Swim', 'Collect'], targetAudience: 'Everyone',
  mechanics: ['dash'], characters: [{ name: 'Diver', role: 'player' }],
  levels: [{ name: 'Shallows', objective: 'Collect ten shells' }],
  monetisationModel: 'Freemium', assetList: [], technicalComplexity: 'medium',
  estimatedCredits: 1200, suggestedPriceGBP: 4.99, commercialScore: 80,
  riskScore: 15, marketplaceCategory: 'Arcade', ...over,
});

const html2d = buildPlayableGame(bp());
const html3d = buildPlayable3dGame(bp({ title: 'Tide Gate' }));

/* ================================================================= *
 * 1. THE SHAPE OF THE THING, STATED PLAINLY
 * ================================================================= */
console.log('\nwhat the two engines actually emit');
{
  t('the 2D engine emits a literal <canvas>', html2d.includes('<canvas'));
  t('the 3D engine emits NO literal <canvas>', !html3d.includes('<canvas'),
    'if this ever fails the runtime changed and the rest of this file needs rereading');
  t('the 3D build boots the hosted runtime instead', gw.usesEngine(html3d));
  t('both are complete documents', /^\s*<!doctype html>/i.test(html2d) && /^\s*<!doctype html>/i.test(html3d));
  t('the gateway considers both playable', gw.looksPlayable(html2d) && gw.looksPlayable(html3d));
}

/* ================================================================= *
 * 2. THE PUBLISH GATE MUST AGREE WITH THE FORGE GATE
 * ================================================================= */
const wallets = new Map();
const games = new Map();
const charges = new Map();

const fake = (strings, ...vals) => {
  const q = strings.join('?').replace(/\s+/g, ' ').trim();
  if (/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/i.test(q)) return Promise.resolve([]);

  if (/FROM wallets WHERE id = \?/i.test(q)) {
    const w = wallets.get(vals[0]);
    return Promise.resolve(w ? [w] : []);
  }
  if (/count\(\*\)/i.test(q) && /FROM games/i.test(q)) {
    const n = [...games.values()].filter((g) => g.creator_wallet === vals[0] && g.status === 'pending_review').length;
    return Promise.resolve([{ count: n }]);
  }
  if (/^INSERT INTO games/i.test(q)) {
    const [id, title, summary, language, html, walletId, email] = vals;
    games.set(id, {
      id, title, summary, language, html, creator_wallet: walletId, creator_email: email,
      status: 'pending_review', plays: 0, price_minor: null,
    });
    return Promise.resolve([{ id }]);
  }
  if (/FROM games WHERE status = 'approved'/i.test(q)) {
    return Promise.resolve([...games.values()].filter((g) => g.status === 'approved'));
  }
  if (/UPDATE games SET status/i.test(q)) {
    const [status, note, id] = vals;
    const g = games.get(id);
    if (!g) return Promise.resolve([]);
    g.status = status; g.note = note;
    return Promise.resolve([{ id }]);
  }
  if (/FROM games WHERE id = \?/i.test(q)) {
    const g = games.get(vals[0]);
    return Promise.resolve(g ? [g] : []);
  }
  if (/FROM forge_charges WHERE id = \?/i.test(q)) {
    const c = charges.get(vals[0]);
    return Promise.resolve(c ? [c] : []);
  }
  if (/SET accepted_at = now\(\)/i.test(q)) {
    const c = charges.get(vals[0]);
    if (!c || c.accepted_at) return Promise.resolve([]);
    c.accepted_at = Date.now();
    return Promise.resolve([{ amount: c.amount, settle_amount: c.settle_amount }]);
  }
  if (/UPDATE wallets SET balance/i.test(q)) {
    const w = wallets.get(vals[1]);
    if (w) w.balance += vals[0];
    return Promise.resolve(w ? [{ balance: w.balance }] : []);
  }
  return Promise.resolve([]);
};

led.__setDbForTests(fake);
const publish = require('./build/api/games.js').default;
const arcade = require('./build/api/arcade.js').default;
const moderation = require('./build/api/moderation.js').default;

const mkRes = () => {
  const r = { code: null, body: null };
  r.setHeader = () => {}; r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r;
};
const call = async (h, method, body, headers = {}) => {
  const res = mkRes();
  await h({ method, headers, body, query: {} }, res);
  return res;
};

const W = 'w-creator000000';
let nextForge = 0;
/** A held forge run, as recordForgeHold leaves it: debited, undecided. */
const heldForge = () => {
  const id = 'f-' + (++nextForge).toString().padStart(4, '0');
  charges.set(id, { id, wallet_id: W, amount: 300, settle_amount: 120, accepted_at: null, refunded_at: null });
  return id;
};
const reset = () => {
  wallets.clear(); games.clear(); charges.clear(); nextForge = 0;
  wallets.set(W, { id: W, balance: 5000, category: 'purchased', plan: 'creator' });
};

(async () => {

console.log('\na 3D build can be published');
{
  reset();
  const res = await call(publish, 'POST', {
    title: 'Tide Gate', summary: 'Reach the gate before the tide.', language: 'en',
    html: html3d, walletId: W, email: 'creator@example.com', forgeId: heldForge(),
  });
  t('the publish endpoint accepts a 3D build', res.code === 200,
    `got ${res.code}: ${JSON.stringify(res.body)}`);
  t('it comes back with a play URL', !!(res.body && res.body.playUrl));
  t('and it enters the moderation queue, not the public arcade',
    !!(res.body && res.body.status === 'pending_review'));
}

console.log('\na 2D build still can, and rubbish still cannot');
{
  reset();
  const ok = await call(publish, 'POST', {
    title: 'Reef Runner', html: html2d, walletId: W, email: 'creator@example.com', forgeId: heldForge(),
  });
  t('the publish endpoint still accepts a 2D build', ok.code === 200,
    `got ${ok.code}: ${JSON.stringify(ok.body)}`);

  reset();
  const prose = await call(publish, 'POST', {
    title: 'Not A Game', html: '<!doctype html><html><body><p>hello</p></body></html>', walletId: W, forgeId: heldForge(),
  });
  t('a document with no game in it is still refused', prose.code === 400,
    'the gate must widen to fit 3D, not disappear');

  reset();
  const fragment = await call(publish, 'POST', {
    title: 'Fragment', html: '<canvas id="c"></canvas>', walletId: W, forgeId: heldForge(),
  });
  t('an HTML fragment is still refused', fragment.code === 400);

  reset();
  const notBooted = await call(publish, 'POST', {
    title: 'Script Only',
    html: '<!doctype html><html><body><script src="/assets/vendor/joshrix3d-1.js"></script></body></html>',
    walletId: W, forgeId: heldForge(),
  });
  t('loading the runtime without booting it is still refused', notBooted.code === 400,
    'a script tag is not a game');
}

/* ================================================================= *
 * 3. THE WHOLE PATH TO THE LANDING PAGE
 * -----------------------------------------------------------------
 * Publishing is only half of it. The landing page reads /api/arcade, which
 * reads status='approved', which only moderation sets. Testing publish alone
 * would have proved a 3D game can be stored while it still never appears.
 * ================================================================= */
console.log('\nforge -> publish -> moderate -> arcade');
{
  reset();
  process.env.MODERATION_KEY = 'test-moderation-key';

  const pub = await call(publish, 'POST', {
    title: 'Tide Gate', summary: 'Reach the gate before the tide.',
    html: html3d, walletId: W, email: 'creator@example.com', forgeId: heldForge(),
  });
  t('the 3D game is stored', pub.code === 200);
  const id = pub.body && pub.body.id;
  t('with an id', !!id);

  let feed = await call(arcade, 'GET', undefined);
  t('it is NOT in the arcade before review', feed.code === 200 && feed.body.games.length === 0,
    'human review is the gate, and it must actually gate');

  const bad = await call(moderation, 'POST', { id, action: 'approve' }, { 'x-admin-key': 'wrong' });
  t('moderation refuses the wrong key', bad.code === 401);

  const mod = await call(moderation, 'POST', { id, action: 'approve' }, { 'x-admin-key': 'test-moderation-key' });
  t('a reviewer can approve it', mod.code === 200 && mod.body.status === 'approved',
    JSON.stringify(mod.body));

  feed = await call(arcade, 'GET', undefined);
  t('and THEN it appears in the arcade feed', feed.code === 200 && feed.body.games.length === 1,
    JSON.stringify(feed.body));
  t('the feed carries what the landing page renders',
    !!(feed.body.games[0] && feed.body.games[0].title === 'Tide Gate'
       && feed.body.games[0].playUrl === '/play/' + id));

  delete process.env.MODERATION_KEY;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
