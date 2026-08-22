/**
 * DOES THE CONSENT GATE ACTUALLY HOLD?
 *
 * An advertising tag is the easiest thing on a site to get legally wrong and
 * the hardest to notice: the pixel works perfectly whether or not it was
 * allowed to fire, so nothing about the product tells you it is non-compliant.
 * privacy.html promises that nothing third-party loads until the visitor
 * accepts, and this file is the only thing standing behind that sentence.
 *
 * It therefore asserts on NETWORK REQUESTS, not on code. Every request the page
 * makes is recorded, and the test fails if a byte reaches connect.facebook.net
 * or googletagmanager.com before Accept is pressed.
 *
 *   node tests/t28-pixels.mjs
 *   (needs playwright + Chromium; CHROMIUM_PATH overrides the lookup)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.env.JOSHRIX_ROOT || process.cwd(), 'frontend');
const PORT = 8108;
const PIXEL = '111122223333444';
const GAID = 'G-TEST123456';

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join(base, dir, 'chrome-linux', 'chrome');
  } catch { /* let playwright look */ }
  return undefined;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  let body = fs.readFileSync(f);
  // Inject test IDs the way a real deploy sets them in config.js.
  if (f.endsWith('config.js')) {
    body = Buffer.from(String(body)
      .replace("window.JOSHRIX_META_PIXEL_ID = window.JOSHRIX_META_PIXEL_ID || '';", `window.JOSHRIX_META_PIXEL_ID = '${PIXEL}';`)
      .replace("window.JOSHRIX_GA_ID = window.JOSHRIX_GA_ID || '';", `window.JOSHRIX_GA_ID = '${GAID}';`));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(body);
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--no-sandbox', '--proxy-bypass-list=127.0.0.1'],
});

const AD_HOSTS = /connect\.facebook\.net|facebook\.com\/tr|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net/i;

async function session(setup) {
  const ctx = await browser.newContext();
  const hits = [];
  // Block the real ad networks: this test must never talk to Meta or Google.
  // Recording the attempt is the assertion; letting it through would be one.
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (AD_HOSTS.test(url)) { hits.push(url); return route.fulfill({ status: 200, body: '' }); }
    return route.continue();
  });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  if (setup) await setup(pg);
  return { ctx, pg, hits, errs };
}

/* ---------------- 1. nothing loads before a choice is made --------------- */
console.log('\n== before the visitor chooses, nothing third-party is fetched ==');
{
  const { ctx, pg, hits, errs } = await session();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
  t('no request reached Meta or Google', hits.length === 0, hits.slice(0, 3).join(' | '));
  t('the consent banner is shown', await pg.isVisible('#jx-consent'));
  t('Decline is present and is not hidden behind another click',
    await pg.isVisible('#jx-consent button[data-c="denied"]'));
  t('Accept and Decline are the same size — refusing must be as easy as accepting',
    await pg.evaluate(() => {
      const a = document.querySelector('#jx-consent button[data-c="granted"]').getBoundingClientRect();
      const d = document.querySelector('#jx-consent button[data-c="denied"]').getBoundingClientRect();
      return Math.abs(a.height - d.height) < 2;
    }));
  t('events fired before the choice do not reach anyone', await pg.evaluate(() => {
    JX.track('purchase', { value: 19, currency: 'GBP' });
    return typeof window.fbq === 'undefined' && typeof window.gtag === 'undefined';
  }));
  t('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ---------------- 2. declining is permanent and total -------------------- */
console.log('\n== declining means nothing ever loads, this visit or the next ==');
{
  const { ctx, pg, hits } = await session();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await pg.click('#jx-consent button[data-c="denied"]');
  await pg.evaluate(() => { JX.track('purchase', { value: 19 }); JX.track('sign_up'); });
  await pg.waitForTimeout(600);
  t('still no request to Meta or Google after declining', hits.length === 0, hits.slice(0, 3).join(' | '));
  t('the banner is gone', !(await pg.isVisible('#jx-consent').catch(() => false)));

  await pg.reload({ waitUntil: 'networkidle' });
  t('and it stays declined on the next page load', hits.length === 0, hits.slice(0, 3).join(' | '));
  t('the visitor is not asked again', !(await pg.isVisible('#jx-consent').catch(() => false)));
  await ctx.close();
}

/* ---------------- 3. accepting loads both, and flushes the queue --------- */
console.log('\n== accepting loads both tags and does not lose what came before ==');
{
  const { ctx, pg, hits, errs } = await session();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
  // An event BEFORE the choice: a visitor who accepts afterwards should still
  // have it counted, which is the whole reason the queue exists.
  await pg.evaluate(() => JX.track('purchase', { value: 19, currency: 'GBP' }));
  await pg.click('#jx-consent button[data-c="granted"]');
  await pg.waitForTimeout(900);

  t('Meta was loaded', hits.some((u) => /connect\.facebook\.net/.test(u)), hits.join(' | '));
  t('Google was loaded', hits.some((u) => /googletagmanager\.com/.test(u)), hits.join(' | '));
  t('fbq exists', await pg.evaluate(() => typeof window.fbq === 'function'));
  t('gtag exists', await pg.evaluate(() => typeof window.gtag === 'function'));
  t('the queued purchase was not thrown away', await pg.evaluate(() =>
    (window.dataLayer || []).some((a) => a && a[0] === 'event' && a[1] === 'purchase')));
  t('Consent Mode was set to denied BEFORE the library loaded', await pg.evaluate(() => {
    const dl = window.dataLayer || [];
    const di = dl.findIndex((a) => a && a[0] === 'consent' && a[1] === 'default');
    const ji = dl.findIndex((a) => a && a[0] === 'js');
    return di >= 0 && (ji < 0 || di < ji);
  }));
  t('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  await pg.reload({ waitUntil: 'networkidle' });
  t('a returning visitor who accepted is not asked again',
    !(await pg.isVisible('#jx-consent').catch(() => false)));
  await ctx.close();
}

/* ---------------- 4. no IDs configured means no banner at all ------------ */
console.log('\n== with no ad IDs set, a visitor is never asked about nothing ==');
{
  const ctx = await browser.newContext();
  const hits = [];
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (AD_HOSTS.test(url)) { hits.push(url); return route.fulfill({ status: 200, body: '' }); }
    // serve config.js with the IDs left empty, as it ships in the repo
    if (/assets\/config\.js/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'text/javascript',
        body: fs.readFileSync(path.join(ROOT, 'assets', 'config.js'), 'utf8') });
    }
    return route.continue();
  });
  const pg = await ctx.newPage();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
  t('no banner is shown', !(await pg.isVisible('#jx-consent').catch(() => false)));
  t('no request to Meta or Google', hits.length === 0, hits.slice(0, 3).join(' | '));
  t('JX.track is still safe to call', await pg.evaluate(() => {
    try { JX.track('purchase', { value: 1 }); return true; } catch (e) { return false; }
  }));
  await ctx.close();
}

/* ---------------- 5. every page carries the tag, and the events exist ---- */
console.log('\n== the tag is on every page, and the money events are wired ==');
{
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const missing = pages.filter((f) => !fs.readFileSync(path.join(ROOT, f), 'utf8').includes('assets/pixels.js'));
  t(`all ${pages.length} pages load pixels.js`, missing.length === 0, missing.join(', '));

  const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const WIRED = [
    ['studio.html', 'forge_start'], ['studio.html', 'forge_complete'], ['studio.html', 'publish'],
    ['signup.html', 'sign_up'], ['marketplace.html', 'begin_checkout'],
    ['pricing.html', 'begin_checkout'], ['dashboard.html', 'list_game'], ['play.html', 'play_game'],
  ];
  for (const [file, ev] of WIRED) {
    t(`${file} fires ${ev}`, new RegExp(`JX\\.track\\(\\s*['"]${ev}['"]`).test(src(file)));
  }

  /* The privacy policy is part of the product here: if it still claims no
     third-party advertising cookies while the pixel ships, the page is false. */
  const priv = src('privacy.html');
  t('privacy.html no longer claims there are no advertising cookies',
    !/No third-party advertising cookies/i.test(priv));
  t('privacy.html explains the choice and that nothing loads first',
    /until you accept/i.test(priv) && /Meta Pixel/i.test(priv) && /Google tag/i.test(priv));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);
