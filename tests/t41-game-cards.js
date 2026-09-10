/**
 * A SHARED GAME LINK MUST UNFURL AS THE GAME.
 *
 * /play/:id rewrote straight to the static frontend/play.html, which sets
 * document.title in JavaScript and nothing else. Link unfurlers do not run
 * JavaScript, so every shared game — the strongest organic asset this platform
 * has, and the thing index.html builds its whole argument on — arrived in
 * WhatsApp, Discord, X and Slack with no title, no description and no image.
 *
 * api/play-html.ts now serves that route and splices the game's own card into
 * the real shell. Three things have to stay true, and each is a way this could
 * go wrong rather than merely fail:
 *
 *   1. An APPROVED game gets its own title, description, canonical and schema.
 *   2. A PENDING or REJECTED game gets NOTHING of its own, plus noindex. A
 *      creator's unreleased work must not become discoverable through a card,
 *      and an unapproved title is not public.
 *   3. The GAME'S BYTES ARE NEVER IN THE RESPONSE. This route reads metadata
 *      only; api/game-html.ts remains the sole paywall. A share card that leaks
 *      the game would make every priced listing free.
 *
 *   node tests/t41-game-cards.js
 */
const fs = require('fs');
const path = require('path');
const led = require('./build/api/_ledger.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const ROOT = path.resolve(__dirname, '..');
const SECRET = '<!-- THE GAME ITSELF, WHICH MUST NEVER APPEAR IN A SHELL -->';

const GAMES = {
  'g-tide-gate-approved': {
    id: 'g-tide-gate-approved', title: 'Tide Gate', summary: 'Reach the gate before the tide takes the causeway.',
    language: 'en', status: 'approved', plays: 412, price_minor: null,
    created_at: '2026-09-01T09:00:00.000Z', html: SECRET,
  },
  'g-priced-reef-runner': {
    id: 'g-priced-reef-runner', title: 'Reef Runner', summary: 'Outswim the tide across five reefs.',
    language: 'en', status: 'approved', plays: 88, price_minor: 499,
    created_at: '2026-09-02T09:00:00.000Z', html: SECRET,
  },
  'g-secret-in-review': {
    id: 'g-secret-in-review', title: 'Unreleased Project Codename Falcon', summary: 'Not public yet.',
    language: 'en', status: 'pending_review', plays: 0, price_minor: null,
    created_at: '2026-09-03T09:00:00.000Z', html: SECRET,
  },
  'g-rejected-thing': {
    id: 'g-rejected-thing', title: 'Rejected Game', summary: 'Did not clear review.',
    language: 'en', status: 'rejected', plays: 0, price_minor: null,
    created_at: '2026-09-04T09:00:00.000Z', html: SECRET,
  },
};

/* The fake enforces the real query shape: getGame() defaults to withHtml=false,
   so a SELECT without the html column must not be able to return one. A fake
   that handed back the whole row regardless would let a leak pass. */
let sawHtmlColumn = false;
const fake = (strings, ...vals) => {
  const q = strings.join('?').replace(/\s+/g, ' ').trim();
  if (/^CREATE TABLE|^ALTER TABLE|^CREATE INDEX/i.test(q)) return Promise.resolve([]);
  if (/FROM games WHERE id = \?/i.test(q)) {
    const g = GAMES[vals[0]];
    if (!g) return Promise.resolve([]);
    const wantsHtml = /,\s*html\s+FROM games/i.test(q);
    if (wantsHtml) sawHtmlColumn = true;
    const { html, ...meta } = g;
    return Promise.resolve([wantsHtml ? g : meta]);
  }
  return Promise.resolve([]);
};
led.__setDbForTests(fake);
const playHtml = require('./build/api/play-html.js').default;

const render = async (id) => {
  let body = '', code = 0, redirected = null;
  const res = {
    setHeader() {}, statusCode: 0,
    status(c) { code = c; return res; },
    send(b) { body = b; return res; },
    end(b) { if (b) body = b; return res; },
    redirect(c, to) { code = c; redirected = to; return res; },
  };
  await playHtml({ method: 'GET', query: { id }, headers: {} }, res);
  return { html: body, code, redirected };
};

(async () => {

console.log('\nthe shell it decorates is the real one');
{
  const shell = fs.readFileSync(path.join(ROOT, 'frontend/play.html'), 'utf8');
  t('frontend/play.html carries the marker block the route splices into',
    shell.includes('<!-- seo-head:start -->') && shell.includes('<!-- seo-head:end -->'),
    'without the markers the route can only serve the page unchanged');
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const rw = vercel.rewrites.find((r) => r.source === '/play/:id');
  t('/play/:id routes to the renderer', !!rw && rw.destination === '/api/play-html?id=:id', JSON.stringify(rw));
  t('the shell is bundled with the function',
    !!(vercel.functions && vercel.functions['api/play-html.ts'] &&
       vercel.functions['api/play-html.ts'].includeFiles),
    'without includeFiles the read fails and every request falls back to the static page');
}

console.log('\nan approved game unfurls as itself');
{
  const { html, code } = await render('g-tide-gate-approved');
  t('answers 200', code === 200, String(code));
  t('the title is the game', /<title>Tide Gate — Play free on JOSHRIX<\/title>/.test(html), (html.match(/<title>[^<]*<\/title>/) || [''])[0]);
  t('og:title is the game', html.includes('property="og:title" content="Tide Gate"'));
  t('og:description is the game summary',
    html.includes('Reach the gate before the tide takes the causeway.'));
  t('the meta description is the game too, not the generic one',
    html.includes('<meta name="description" content="Reach the gate before the tide takes the causeway.">'));
  t('canonical is this game', html.includes('rel="canonical" href="https://www.joshrix.com/play/g-tide-gate-approved"'));
  t('og:url is this game', html.includes('og:url" content="https://www.joshrix.com/play/g-tide-gate-approved"'));
  t('the card image is absolute and sized',
    html.includes('og:image" content="https://www.joshrix.com/assets/og-cover.png') &&
    html.includes('og:image:width" content="1200"'));
  t('twitter:card is summary_large_image', html.includes('name="twitter:card" content="summary_large_image"'));
  t('VideoGame structured data is emitted', html.includes('"@type":"VideoGame"'));
  t('a free game offers price 0', /"price":"0"/.test(html));
  t('the play count becomes an interaction statistic', /"userInteractionCount":412/.test(html));
  t('it is indexable', !/name="robots" content="[^"]*noindex/.test(html));
  t('the page still loads its own scripts', html.includes('/assets/config.js'));
}

console.log('\na priced game does not advertise a price it does not have');
{
  const { html } = await render('g-priced-reef-runner');
  t('the offer is £4.99, not zero', /"price":"4\.99"/.test(html),
    'declaring 0 for a paid listing contradicts the checkout the buyer then hits');
}

console.log('\nan unapproved game reveals nothing');
for (const id of ['g-secret-in-review', 'g-rejected-thing']) {
  const { html, code } = await render(id);
  const title = GAMES[id].title;
  t(`${id}: answers 200 so the creator's own preview still works`, code === 200);
  t(`${id}: the title is NOT in the page`, !html.includes(title),
    'an unreleased title must not become public through a share card');
  t(`${id}: the summary is NOT in the page`, !html.includes(GAMES[id].summary));
  t(`${id}: no canonical claims this URL`, !html.includes(`/play/${id}"`));
  t(`${id}: noindex`, /name="robots" content="[^"]*noindex/.test(html),
    'a crawler must not index a URL whose game may never go public');
  t(`${id}: the generic card is still there so the link is not naked`,
    html.includes('property="og:title"'));
}

console.log('\nthe paywall is untouched');
{
  for (const id of Object.keys(GAMES)) {
    const { html } = await render(id);
    t(`${id}: the game's bytes are not in the response`, !html.includes(SECRET),
      'api/game-html.ts is the only thing that may serve a game');
  }
  t('the route never asked the database for the html column', !sawHtmlColumn,
    'getGame() defaults to withHtml=false and this route must rely on that');
}

console.log('\na bad id degrades rather than breaking');
{
  const { html, code } = await render('../../etc/passwd');
  t('a malformed id is not looked up', code === 200 && !html.includes('passwd'));
  t('and still returns a usable page', html.includes('property="og:title"'));
  t('but is not indexed', /name="robots" content="[^"]*noindex/.test(html));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
