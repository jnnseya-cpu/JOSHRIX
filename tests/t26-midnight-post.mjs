/**
 * IS THE GAME ACTUALLY PLAYABLE?
 *
 * Every previous claim that a build "works" meant it parsed, appended a canvas
 * and called the runtime's methods. The 8,411-byte stub the forge shipped for
 * weeks passed all of that and was nothing to play. So this file does not check
 * that the file loads. It PLAYS the game:
 *
 *   boot -> press Start -> hold the throttle -> steer -> reach a doorstep ->
 *   watch the parcel count go up -> finish the round
 *
 * and asserts on what a player would see, including the HUD text.
 *
 * Input goes through the runtime's own key map, which is exactly what the
 * keydown handler writes to — so the autopilot drives the same code path a
 * person's fingers do, not a private test API.
 *
 *   node tests/t26-midnight-post.mjs
 *   (needs playwright + Chromium; CHROMIUM_PATH overrides the lookup)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.env.JOSHRIX_ROOT || process.cwd(), 'frontend');
const PORT = 8103;
const SHOTS = process.env.JX_SHOTS || null;   // set to a directory to keep screenshots

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
    if (dir) return path.join(base, dir, 'chrome-linux', 'chrome');
  } catch { /* let playwright look */ }
  return undefined;
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
function serve(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}
const srv = http.createServer(serve);
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--proxy-bypass-list=127.0.0.1'],
});
/* A small window deliberately. There is no GPU here, so three.js falls back to
   swiftshader and the cost is fill-rate: the same scene, same mesh count, runs
   at 2.7fps at 1280x800 and 9.7fps at 640x400. Shrinking the window is what
   makes a full eight-drop play-through finish in a couple of minutes rather
   than timing out. It says nothing about speed on real hardware, and this file
   does not claim it does — see the phone check at the end for framing. */
const ctx = await browser.newContext({ viewport: { width: 512, height: 320 } });

/* A published game hardcodes https://www.joshrix.com for three.js, the runtime
   and the model library, because that is what a shared link has to keep working
   against forever. Serve those from this checkout so the test measures THIS
   commit's runtime and THIS commit's models. */
await ctx.route('https://www.joshrix.com/**', async (route) => {
  const rel = new URL(route.request().url()).pathname;
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});

const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', (e) => { if (e.message !== 'Event') errs.push(e.message); });
pg.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errs.push('console: ' + m.text()); });

await pg.goto(`http://127.0.0.1:${PORT}/games/midnight-post.html`, { waitUntil: 'load', timeout: 30000 });
await pg.waitForFunction(() => !!window.JOSHRIX_GAME, null, { timeout: 15000 });

console.log('\n== it boots into a world, before anything downloads ==');
t('the runtime handed the game a live scene', await pg.evaluate(() => !!window.JOSHRIX_GAME.scene));
t('there is exactly one canvas', (await pg.locator('canvas').count()) === 1,
  'a second canvas means the game drew its own renderer');
t('it opens on the title, not mid-game', await pg.evaluate(() => window.JOSHRIX_GAME.state) === 'title');
t('the round is eight doorsteps', await pg.evaluate(() => window.JOSHRIX_GAME.stops.length) === 8);

console.log('\n== the models are real, and they arrive ==');
await pg.waitForFunction(() => window.JOSHRIX_GAME.has('van'), null, { timeout: 20000 }).catch(() => {});
const loaded = await pg.evaluate(() => ['van', 'house', 'shop', 'lantern', 'tree', 'parked']
  .filter((k) => window.JOSHRIX_GAME.has(k)));
t('the library van loaded', loaded.includes('van'), JSON.stringify(loaded));
t('the village loaded (houses, shop, lantern, trees)',
  ['house', 'shop', 'lantern', 'tree'].every((k) => loaded.includes(k)), JSON.stringify(loaded));
t('the parked-car hazard loaded', loaded.includes('parked'));

if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'midnight-post-title.png') });

console.log('\n== pressing Start begins a round ==');
await pg.locator('button', { hasText: /start|play|begin/i }).first().click();
await pg.waitForTimeout(600);
t('state is play', await pg.evaluate(() => window.JOSHRIX_GAME.state) === 'play');
const hud0 = await pg.locator('body').innerText();
t('the HUD shows an empty round', /PARCELS[\s\S]{0,12}0\s*\/\s*8/i.test(hud0), hud0.slice(0, 160));
t('the HUD shows a countdown', /DAWN IN[\s\S]{0,12}\d:\d\d/i.test(hud0), hud0.slice(0, 160));

console.log('\n== the throttle actually drives the van ==');
/* Measured in SIMULATED seconds, not wall-clock. This box has no GPU — three.js
   runs on swiftshader at a few frames a second — and the runtime caps dt at
   0.05, so a wall-clock window advances almost no game time and a perfectly
   good van looks motionless. Holding the key until G.elapsed has advanced is
   the same measurement on any machine. */
const drive = (keys, simSeconds) => pg.evaluate(async ([ks, want]) => {
  const G = window.JOSHRIX_GAME;
  const t0 = G.elapsed;
  const p0 = { x: G.van.position.x, z: G.van.position.z, h: G.van.rotation.y };
  ks.forEach((k) => { G.keys[k] = true; });
  const wallStop = Date.now() + 60000;              // never hang if frames stop
  while (G.elapsed - t0 < want && Date.now() < wallStop) await new Promise((r) => setTimeout(r, 40));
  ks.forEach((k) => { G.keys[k] = false; });
  return {
    sim: +(G.elapsed - t0).toFixed(2),
    dist: +Math.hypot(G.van.position.x - p0.x, G.van.position.z - p0.z).toFixed(2),
    turned: +(G.van.rotation.y - p0.h).toFixed(2),
  };
}, [keys, simSeconds]);

const fwd = await drive(['w'], 0.9);
t(`holding the throttle moved the van (${fwd.dist} units in ${fwd.sim}s of game time)`,
  fwd.dist > 1.5, JSON.stringify(fwd));

console.log('\n== steering turns it ==');
const turn = await drive(['w', 'a'], 0.8);
t(`steering changed the heading (${turn.turned} rad)`, Math.abs(turn.turned) > 0.15, JSON.stringify(turn));

console.log('\n== a full round can be driven and finished ==');
/* Autopilot through the runtime's own key map — the same fields the keydown
   handler sets. It steers toward the lit doorstep and eases off to drop. */
const outcome = await pg.evaluate(async () => {
  const G = window.JOSHRIX_GAME, K = G.keys;
  const clear = () => { K.w = K.s = K.a = K.d = false; };
  const t0 = Date.now();
  let delivered0 = G.stops.filter((s) => s.done).length;
  while (G.state === 'play' && Date.now() - t0 < 240000) {
    const stop = G.stops.find((s) => s.beacon.visible) || G.stops.find((s) => !s.done);
    if (!stop) break;
    const dx = stop.group.position.x - G.van.position.x;
    const dz = stop.group.position.z - G.van.position.z;
    const dist = Math.hypot(dx, dz);
    let want = Math.atan2(dx, dz);

    /* Steer around parked cars. Without this the autopilot ploughs into them,
       loses six seconds and gets shoved off course — which made the length of a
       round depend on where the cars happened to spawn, and the test flaky
       rather than wrong. A human can see them; the autopilot should too. */
    let nearest = null, nd = 6;
    for (const h of G.hazards) {
      const hx = h.obj.position.x - G.van.position.x, hz = h.obj.position.z - G.van.position.z;
      const d = Math.hypot(hx, hz);
      if (d >= nd) continue;
      const ahead = Math.atan2(hx, hz);
      let off = Math.atan2(Math.sin(ahead - want), Math.cos(ahead - want));
      if (Math.abs(off) < 0.6) { nearest = { d, off }; nd = d; }
    }
    if (nearest) want += (nearest.off > 0 ? -1 : 1) * (0.9 - nearest.d / 10);

    let diff = Math.atan2(Math.sin(want - G.van.rotation.y), Math.cos(want - G.van.rotation.y));
    clear();
    if (diff > 0.08) K.a = true; else if (diff < -0.08) K.d = true;
    // ease off on the approach: arriving flat out is not arriving
    if (dist > 3.8) K.w = true; else if (dist < 2.2) K.s = true;
    /* Wait on SIMULATED time, not the wall clock.
       Dawn arrives after a fixed amount of G.elapsed, but a 60ms sleep buys a
       different slice of game time depending on frame rate — and on this
       GPU-less box the frame rate collapses when the other browser tests run
       beside this one. Pacing by wall clock therefore gave the autopilot three
       times fewer steering decisions per game-second in a full suite run than
       standalone, so it drove badly and the round timed out: the test passed
       alone and failed in the suite. Waiting for the game's own clock to move
       makes the number of decisions per game-second identical at any frame
       rate. The wall-clock bound below is only a hang guard. */
    const mark = G.elapsed;
    const guard = Date.now();
    while (G.elapsed - mark < 0.06 && Date.now() - guard < 2000 && G.state === 'play') {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
  clear();
  return {
    state: G.state,
    delivered: G.stops.filter((s) => s.done).length,
    started: delivered0,
    score: G.score,
    headline: (document.querySelector('.jx-over h1, .jx-over h2, .jx-over div') || {}).textContent || '',
  };
});

t(`parcels were delivered by driving (${outcome.delivered} of 8)`, outcome.delivered >= 3,
  JSON.stringify(outcome));
t('the score went up with them', outcome.score > 0, JSON.stringify(outcome));
t('the round reached an ending', outcome.state === 'over', `state ${outcome.state}`);

const hud1 = await pg.locator('body').innerText();
t('the HUD counted the deliveries', new RegExp(`PARCELS[\\s\\S]{0,12}${outcome.delivered}\\s*/\\s*8`, 'i').test(hud1),
  hud1.slice(0, 200));
t('an end screen is shown', /round complete|dawn/i.test(hud1), hud1.slice(0, 300));

if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'midnight-post-end.png') });

console.log('\n== it survived the whole run ==');
t('no JavaScript errors at any point', errs.length === 0, errs.slice(0, 3).join(' | '));

/* A phone is the likeliest device for a shared game link. */
console.log('\n== it plays at phone size ==');
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await phone.route('https://www.joshrix.com/**', async (route) => {
  const f = path.join(ROOT, new URL(route.request().url()).pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
});
const pp = await phone.newPage();
const perrs = [];
pp.on('pageerror', (e) => { if (e.message !== 'Event') perrs.push(e.message); });
await pp.goto(`http://127.0.0.1:${PORT}/games/midnight-post.html`, { waitUntil: 'load', timeout: 30000 });
await pp.waitForFunction(() => !!window.JOSHRIX_GAME, null, { timeout: 15000 });
await pp.locator('button', { hasText: /start|play|begin/i }).first().click();
await pp.waitForTimeout(1200);
t('it starts on a phone viewport', await pp.evaluate(() => window.JOSHRIX_GAME.state) === 'play');
t('the canvas fills the screen', await pp.evaluate(() => {
  const c = document.querySelector('canvas');
  return c.clientWidth >= window.innerWidth - 2 && c.clientHeight >= window.innerHeight - 2;
}), 'a game that letterboxes on a phone reads as broken');
t('no errors on mobile', perrs.length === 0, perrs.slice(0, 2).join(' | '));
if (SHOTS) await pp.screenshot({ path: path.join(SHOTS, 'midnight-post-phone.png') });

console.log(`\n  ${pass} passed, ${fail} failed`);
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);
