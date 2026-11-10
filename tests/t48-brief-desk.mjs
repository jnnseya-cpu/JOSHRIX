/**
 * THE GROWTH BRIEF DESK, IN A REAL BROWSER.
 *
 * /api/growth-brief is tested in t47 by reading it. What a source test cannot
 * see is whether an operator can actually reach it, and this repository has been
 * caught by exactly that gap before: t16 counted a library that was never
 * rendered, and the marketplace shipped with no control that set a price.
 *
 * The state this file exists for is 204. "No brief is in force" is the NORMAL
 * answer — the Content Agent falls back to the editorial calendar — and an
 * operator who reads that as a failure will go looking for a broken endpoint, or
 * worse, approve a second brief to fix nothing. So the empty state is asserted as
 * carefully as the populated one.
 *
 * The fake API answers; nothing here touches a database or a model.
 *
 *   node tests/t48-brief-desk.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { findChromium } from "./_chromium.mjs";

const ROOT = path.join(process.env.JOSHRIX_ROOT || process.cwd(), 'frontend');
const PORT = 8108;

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

const BRIEF = {
  schema_version: 1, brief_id: 'gb_live', brief_version: 4,
  tenant_id: 'joshrix', platform_id: 'joshrix-studio',
  market: 'GB', locale: 'en-GB', topic_id: 'ai-game-creation',
  opportunity_score: 86.25, confidence: 83.5,
  valid_from: '2026-11-10T00:00:00Z', expires_at: '2026-11-17T00:00:00Z',
  evidence_ids: ['ev_1'], audience: 'Creators comparing AI game tools',
  intent: 'decide which platform to build on', approved_claim_ids: ['claim_1'],
  cta_id: 'cta_open_studio', allowed_channels: ['seo', 'organic_social'],
  prohibited_claims: ['guaranteed earnings'], objective: 'forge starts per eligible session',
  experiment_id: 'exp_1', policy_version: 1,
};

/** One page with the admin key already unlocked and the brief API stubbed. */
async function open(handlers) {
  const ctx = await browser.newContext();
  const errors = [], sent = [];
  await ctx.addInitScript(() => { try { sessionStorage.setItem('jx.modKey', 'test-key'); } catch (e) {} });
  await ctx.route('**/api/**', async (route) => {
    const req = route.request();
    const url = req.url();
    /* Only the brief desk's own posts. admin.html also fires a pageview beacon,
       and counting that as "the page sent something" made an earlier version of
       the invalid-JSON assertion pass for the wrong reason. */
    if (req.method() === 'POST' && url.includes('/api/growth-brief')) sent.push(JSON.parse(req.postData() || '{}'));
    const answer = handlers(url, req);
    if (answer === undefined) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (answer.status === 204) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: answer.status ?? 200, contentType: 'application/json', body: JSON.stringify(answer.body ?? {}) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { /* A non-2xx response logs a browser console error of its own; a 422 the page
       then displays correctly is not a page fault. */
    if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/admin.html`, { waitUntil: 'domcontentloaded' });
  return { page, ctx, errors, sent };
}

/* ------------------------------------------------------- the 204 state */
{
  const { page, ctx, errors } = await open((url) => {
    if (url.includes('channel=seo')) return { status: 204 };
    if (url.includes('list=1')) return { body: { briefs: [], count: 0 } };
  });
  const force = page.locator('#briefInForce');
  await force.filter({ hasText: 'No brief in force' }).waitFor({ timeout: 15000 }).catch(() => {});
  const text = await force.textContent();
  t('204 reads as "no brief in force", not as an error',
    /No brief in force/.test(text) && !/⚠/.test(text), JSON.stringify(text));
  t('and it says the agent is on baseline behaviour, so nobody goes hunting',
    /baseline/i.test(text), JSON.stringify(text));
  t('an empty archive says so rather than staying on "Loading…"',
    /No briefs have been approved yet/.test(await page.locator('#briefList').textContent()));
  t('no page error in the empty state', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* -------------------------------------------- a brief in force, and withdrawal */
{
  const { page, ctx, errors, sent } = await open((url, req) => {
    if (url.includes('channel=seo')) return { body: { brief: BRIEF, briefVersion: 4, expiresAt: BRIEF.expires_at, cacheSeconds: 60, rejected: [] } };
    if (url.includes('list=1')) {
      return { body: { briefs: [
        { briefId: 'gb_live', briefVersion: 4, market: 'GB', locale: 'en-GB', topicId: 'ai-game-creation', status: 'approved', validFrom: BRIEF.valid_from, expiresAt: BRIEF.expires_at, objective: BRIEF.objective, opportunityScore: 86.25, confidence: 83.5 },
        { briefId: 'gb_old', briefVersion: 1, market: 'GB', locale: 'en-GB', topicId: 'x', status: 'archived', validFrom: BRIEF.valid_from, expiresAt: BRIEF.expires_at, objective: 'retired', opportunityScore: 70, confidence: 80 },
      ], count: 2 } };
    }
    if (req.method() === 'POST') return { body: { ok: true, briefId: 'gb_live', briefVersion: 4, status: 'archived' } };
  });
  await page.locator('#briefInForce').filter({ hasText: 'gb_live' }).waitFor({ timeout: 15000 }).catch(() => {});
  const force = await page.locator('#briefInForce').textContent();
  t('the brief in force names itself, with its version', /gb_live v4/.test(force), JSON.stringify(force));
  t('and shows the expiry, which is the field that decides whether it still applies',
    /2026-11-17T00:00:00Z/.test(force), JSON.stringify(force));
  t('and the objective, which is what it actually changes', /forge starts per eligible session/.test(force));

  const list = await page.locator('#briefList').textContent();
  t('the archive lists both the approved and the archived version', /gb_live v4/.test(list) && /gb_old v1/.test(list));
  t('the scores are shown so an operator can see what it was approved on', /86\.25/.test(list) && /83\.5/.test(list));

  /* An archived brief must not offer a withdraw button — withdrawing it again
     would 404, and an operator should never be shown a control that cannot work. */
  const buttons = await page.locator('#briefList .jxWithdraw').count();
  t('only the approved brief offers withdrawal', buttons === 1, `${buttons} withdraw buttons`);

  await page.locator('#briefList .jxWithdraw').first().click();
  await page.locator('#briefMsg').filter({ hasText: 'Withdrawn' }).waitFor({ timeout: 15000 }).catch(() => {});
  t('withdrawal sends the id and version the server expects',
    sent.some((s) => s.archive && s.archive.briefId === 'gb_live' && s.archive.briefVersion === 4),
    JSON.stringify(sent));
  t('and the outcome is reported to the operator', /Withdrawn/.test(await page.locator('#briefMsg').textContent()));
  t('no page error with a brief in force', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* --------------------------------------- approval: the 422 that must be readable */
{
  const { page, ctx, errors, sent } = await open((url, req) => {
    if (url.includes('channel=seo')) return { status: 204 };
    if (url.includes('list=1')) return { body: { briefs: [], count: 0 } };
    if (req.method() === 'POST') {
      return { status: 422, body: { error: 'brief does not satisfy Growth Brief v1', issues: [{ path: 'evidence_ids', message: 'Too small: expected array to have >=1 items' }] } };
    }
  });
  await page.locator('#briefList').filter({ hasText: 'No briefs' }).waitFor({ timeout: 15000 }).catch(() => {});

  /* Malformed JSON is caught before a round trip — a typo should not look like a
     server fault. */
  await page.fill('#briefJson', '{not json');
  await page.click('#btnApproveBrief');
  t('invalid JSON is reported locally and sends nothing',
    /not valid JSON/.test(await page.locator('#briefMsg').textContent()) && sent.length === 0);

  await page.fill('#briefJson', JSON.stringify({ ...BRIEF, evidence_ids: [] }));
  await page.click('#btnApproveBrief');
  /* Wait on a string that ONLY the settled state contains. An earlier version
     waited for "Growth Brief v1", which the PENDING message also contains
     ("Validating against Growth Brief v1…"), so the wait returned immediately
     and the assertion raced the response — green alone, red under load. */
  await page.locator('#briefMsg').filter({ hasText: 'evidence_ids' }).waitFor({ timeout: 15000 }).catch(() => {});
  const m = await page.locator('#briefMsg').textContent();
  t('a 422 shows WHICH field failed, not just that it failed',
    /evidence_ids/.test(m) && />=1 items/.test(m), JSON.stringify(m));
  t('the brief is posted under the "brief" key the endpoint reads',
    sent.some((s) => s.brief && s.brief.brief_id === 'gb_live'), JSON.stringify(sent.slice(-1)));
  t('the button is re-enabled after a rejection, so a correction can be retried',
    (await page.locator('#btnApproveBrief').isDisabled()) === false);
  t('no page error on the rejection path', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------ the brief is DATA, not markup */
{
  /* A brief is operator-supplied text that ends up on an admin screen. If it is
     written into the DOM unescaped, approving a brief becomes a way to run
     script in the one session that holds the admin key. */
  const hostile = '<img src=x onerror="window.__xss=1">';
  const { page, ctx, errors } = await open((url) => {
    if (url.includes('channel=seo')) return { body: { brief: { ...BRIEF, objective: hostile, audience: hostile }, rejected: [] } };
    if (url.includes('list=1')) return { body: { briefs: [{ briefId: hostile, briefVersion: 1, market: 'GB', locale: 'en-GB', topicId: 'x', status: 'approved', validFrom: BRIEF.valid_from, expiresAt: BRIEF.expires_at, objective: hostile, opportunityScore: 1, confidence: 1 }], count: 1 } };
  });
  await page.locator('#briefInForce').filter({ hasText: 'onerror' }).waitFor({ timeout: 15000 }).catch(() => {});
  t('a hostile objective is rendered as text, not executed',
    (await page.evaluate(() => window.__xss)) === undefined);
  t('and no injected element reached the DOM',
    (await page.locator('#briefInForce img, #briefList img').count()) === 0);
  t('while the text itself is still visible to the operator',
    /onerror/.test(await page.locator('#briefInForce').textContent()));
  t('no page error on hostile input', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
