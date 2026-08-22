/**
 * THE TWO ENDS OF THE MARKETPLACE, in a real browser.
 *
 * The money rules are enforced on the server and tested in t24. What this file
 * tests is the thing a server test cannot see: whether a human can actually
 * reach them. Both ends were missing entirely — no control set a price and no
 * button bought anything — so "it works" has to mean a click produces the right
 * request, not that the handler would have answered correctly if called.
 *
 * The fake API records what the page SENT, because the most valuable assertion
 * here is a negative one: the Buy button must never transmit a price.
 *
 *   node tests/t25-marketplace-ui.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.env.JOSHRIX_ROOT || process.cwd(), 'frontend');
const PORT = 8101;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join(base, dir, 'chrome-linux', 'chrome');
  } catch { /* let playwright look */ }
  return undefined;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--proxy-bypass-list=127.0.0.1'],
});

/* ------------------------------------------------------------------ buyer */
{
  const sent = [];
  const ctx = await browser.newContext();
  await ctx.route('**/api/**', async (route) => {
    const req = route.request();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.url().includes('/api/arcade')) {
      return json({ games: [
        { id: 'g-reef-abc1234567', title: 'Coral Reef', summary: 'Dive.', plays: 40, playUrl: '/play/g-reef-abc1234567', priceMinor: 499 },
        { id: 'g-free-def7654321', title: 'Dino Island', summary: 'Run.', plays: 900, playUrl: '/play/g-free-def7654321', priceMinor: null },
      ], count: 2, forSale: 1 });
    }
    if (req.url().includes('/api/checkout')) {
      sent.push(JSON.parse(req.postData() || '{}'));
      return json({ mode: 'live', checkoutUrl: `http://127.0.0.1:${PORT}/index.html?stripe=1` });
    }
    return json({});
  });
  const pg = await ctx.newPage();
  const errs = [];
  // The pages load the Firebase auth SDK from gstatic. It is unreachable here
  // (and for any offline user), and the browser reports that as a bare "Event".
  // auth.js already degrades to local mode, so that is expected, not a defect.
  pg.on('pageerror', (e) => { if (e.message !== 'Event') errs.push(e.message); });
  await pg.goto(`http://127.0.0.1:${PORT}/marketplace.html`, { waitUntil: 'networkidle', timeout: 20000 });
  await pg.waitForTimeout(400);

  console.log('\n== the marketplace separates what is for sale from what is free ==');
  const saleCards = pg.locator('#mkSale .card');
  const freeCards = pg.locator('#mkGrid .card');
  t('the priced world is in the For Sale grid', (await saleCards.count()) === 1);
  t('the free world is not', (await freeCards.count()) === 1);
  t('the price is shown in pounds', /£4\.99/.test(await saleCards.first().textContent()));
  t('a buyer can try it before paying', (await saleCards.first().locator('a[href^="/play/"]').count()) === 1);

  console.log('\n== Buy sends an identifier, never a price ==');
  await saleCards.first().locator('.mkBuy').click();
  await pg.waitForTimeout(500);
  t('checkout was called once', sent.length === 1, JSON.stringify(sent));
  t('it sent the listing id', sent[0]?.listingId === 'g-reef-abc1234567');
  t('it sent NO price', !('priceMinor' in (sent[0] || {})) && !('price' in (sent[0] || {})),
    'a browser-supplied price is not a price');
  t('it sent NO seller plan or commission',
    !('sellerPlan' in (sent[0] || {})) && !('commission' in (sent[0] || {})));
  t('the browser followed Stripe\'s URL', /stripe=1/.test(pg.url()), pg.url());
  t('no JS errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* --------------------------------------------------------------- creator */
{
  const sent = [];
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    localStorage.setItem('jx.profile', JSON.stringify({ serverWalletId: 'w-creator000000', email: 'c@x.com', displayName: 'C', acu: 0 }));
  });
  await ctx.route('**/api/**', async (route) => {
    const req = route.request();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.url().includes('/api/my-games')) {
      return json({ games: [
        { id: 'g-reef-abc1234567', title: 'Coral Reef', status: 'approved', plays: 12, createdAt: Date.now(), playUrl: '/play/g-reef-abc1234567', previewUrl: '/play/g-reef-abc1234567?preview=1', priceMinor: null, sellerPlan: null },
      ], count: 1, totalPlays: 12 });
    }
    if (req.url().includes('/api/wallet-init')) return json({ mode: 'live', walletId: 'w-creator000000', balance: 0, category: 'standard', plan: 'creator' });
    if (req.url().includes('/api/listing')) {
      const b = JSON.parse(req.postData() || '{}');
      sent.push(b);
      if (b.priceMinor === null) return json({ ok: true, listed: false, priceMinor: null });
      if (b.priceMinor < 50) return json({ error: 'A price must be a whole number of pence between 50 and 10,000,000.' }, 400);
      return json({ ok: true, listed: true, priceMinor: b.priceMinor, commissionRate: 0.25, youKeepMinor: 355, status: 'approved', note: 'On sale now.' });
    }
    return json({});
  });
  const pg = await ctx.newPage();
  const errs = [];
  // The pages load the Firebase auth SDK from gstatic. It is unreachable here
  // (and for any offline user), and the browser reports that as a bare "Event".
  // auth.js already degrades to local mode, so that is expected, not a defect.
  pg.on('pageerror', (e) => { if (e.message !== 'Event') errs.push(e.message); });
  await pg.goto(`http://127.0.0.1:${PORT}/dashboard.html`, { waitUntil: 'networkidle', timeout: 20000 });
  await pg.waitForTimeout(500);

  console.log('\n== a creator can put their own world on sale ==');
  const row = pg.locator('#myGamesBody tr').first();
  t('the games table has a Price control', (await row.locator('.gPrice').count()) === 1,
    'studio.html promised "You set the price" with nothing behind it');

  await row.locator('.gPrice').fill('4.99');
  await row.locator('.gSave').click();
  await pg.waitForTimeout(400);
  t('saving posts to /api/listing', sent.length === 1, JSON.stringify(sent));
  t('pounds typed become PENCE sent', sent[0]?.priceMinor === 499, JSON.stringify(sent[0]));
  t('it sends the wallet and the game, nothing about commission',
    sent[0]?.walletId === 'w-creator000000' && sent[0]?.gameId === 'g-reef-abc1234567'
    && !('sellerPlan' in sent[0]) && !('commission' in sent[0]));
  t('the creator is shown what they keep, from the server',
    /you keep £3\.55/i.test(await row.locator('.gMsg').textContent()),
    await row.locator('.gMsg').textContent());

  console.log('\n== a refusal is shown as a refusal ==');
  await row.locator('.gPrice').fill('0.10');
  await row.locator('.gSave').click();
  await pg.waitForTimeout(400);
  t('the server error is displayed', /between 50/.test(await row.locator('.gMsg').textContent()),
    await row.locator('.gMsg').textContent());

  console.log('\n== clearing the box unlists ==');
  await row.locator('.gPrice').fill('');
  await row.locator('.gSave').click();
  await pg.waitForTimeout(400);
  t('null price is sent', sent[sent.length - 1]?.priceMinor === null);
  t('and it says so', /not for sale/i.test(await row.locator('.gMsg').textContent()));
  t('no JS errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);
