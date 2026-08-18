/**
 * TESTER DESIGNATION, in a real browser.
 *
 * "No free AI except accounts we designate" is only true if the designation
 * actually works from the admin bridge — and if the bridge never offers a
 * control the server will refuse. A wallet that has PURCHASED cannot be
 * reclassified, so the button must not be there at all: an admin pressing a
 * button that always fails learns nothing about why.
 *
 * The API is faked, but the fake MUTATES STATE and applies the same refusal, so
 * a click is a real round-trip rather than a repainted label.
 *
 *   node tests/t22-tester-designation.mjs
 *   (needs playwright + the preinstalled Chromium; set CHROMIUM_PATH to override)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.env.JOSHRIX_ROOT || process.cwd(), 'frontend');
const PORT = 8099;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join(base, dir, 'chrome-linux', 'chrome');
  } catch { /* fall through to playwright's own lookup */ }
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

const WALLETS = [
  { id: 'w-gated', balance: 0, category: 'standard', email: 'public@example.com', name: 'Public', plan: 'explorer' },
  { id: 'w-tester', balance: 20000, category: 'tester', email: 'tester@example.com', name: 'Tester', plan: 'explorer' },
  { id: 'w-paid', balance: 5000, category: 'purchased', email: 'customer@example.com', name: 'Customer', plan: 'creator' },
];

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--proxy-bypass-list=127.0.0.1'],
});
const ctx = await browser.newContext();
await ctx.addInitScript(() => { try { sessionStorage.setItem('jx.modKey', 'k'); } catch { /* private mode */ } });

await ctx.route('**/api/**', async (route) => {
  const req = route.request();
  const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
  if (req.url().includes('/api/moderation')) return json({ ok: true });
  if (req.url().includes('/api/admin-wallets')) {
    if (req.method() === 'GET') return json({ wallets: WALLETS, count: WALLETS.length });
    const b = JSON.parse(req.postData() || '{}');
    const w = WALLETS.find((x) => x.id === b.walletId);
    if (!w) return json({ error: 'not found' }, 404);
    if (b.category) {
      // the guard that matters: purchased is terminal
      if (w.category === 'purchased') return json({ error: 'This wallet has purchased ACUs.' }, 409);
      w.category = b.category;
      return json({ ok: true, walletId: w.id, category: w.category, balance: w.balance });
    }
    if (typeof b.amount === 'number') { w.balance += b.amount; return json({ ok: true, walletId: w.id, granted: b.amount, balance: w.balance }); }
    return json({ error: 'unhandled' }, 400);
  }
  return json({});
});

const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
pg.on('dialog', (d) => d.accept());
await pg.goto(`http://127.0.0.1:${PORT}/admin.html`, { waitUntil: 'networkidle', timeout: 20000 });
await pg.waitForTimeout(500);

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

await pg.click('#btnLoadWallets');
await pg.waitForTimeout(500);

const rows = pg.locator('#walletsList > div');
t('all three wallets rendered', (await rows.count()) === 3, String(await rows.count()));

const gated = rows.nth(0), tester = rows.nth(1), paid = rows.nth(2);
t('a gated account offers "Make tester"', (await gated.locator('.wcat').textContent()) === 'Make tester');
t('a tester offers "Revoke tester"', (await tester.locator('.wcat').textContent()) === 'Revoke tester');
t('a purchased account has NO category control', (await paid.locator('.wcat').count()) === 0,
  'the server refuses it — offering the button promises something it will not do');
t('and says why it is locked', /paid . locked/i.test(await paid.textContent()));

await gated.locator('.wcat').click();
await pg.waitForTimeout(400);
t('promoting a gated account updates the button', (await gated.locator('.wcat').textContent()) === 'Revoke tester');
t('and the category label', (await gated.locator('.wcatname').textContent()) === 'tester');
t('the server really changed', WALLETS[0].category === 'tester');

await gated.locator('.wcat').click();
await pg.waitForTimeout(400);
t('revoking puts it back', (await gated.locator('.wcat').textContent()) === 'Make tester' && WALLETS[0].category === 'standard');

t('no JS errors on the page', errs.length === 0, errs.join(' | '));

console.log(`\n  ${pass} passed, ${fail} failed`);
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);
