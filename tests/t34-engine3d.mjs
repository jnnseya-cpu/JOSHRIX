/**
 * THE 3D FORGE ALWAYS PRODUCES A 3D GAME — and it is playable.
 *
 * forge-game called buildPlayableGame(bp) regardless of mode, and that builder
 * makes a 2D paddle game. So a 3D forge whose AI failed, or whose AI build
 * failed to render on the client, shipped a flat catch game with the creator's
 * title on it. A creator asked for a 3D world and got a 2D minigame. That is
 * what "it only makes short character games" was, and it survived weeks of
 * fixing because nothing in the build environment could run a forge to see it.
 *
 * The deterministic 3D engine needs no provider key, which is exactly why this
 * test can exist: it BUILDS a game and then PLAYS it in a real browser with an
 * autopilot, and asserts the score goes up and the chase takes lives. A game
 * that renders but cannot be played is the failure this whole file exists to
 * catch — a screenshot of a nice-looking world proves nothing.
 *
 *   node tests/t34-engine3d.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const eng = require('./build/api/_engine3d.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/* ---------- every model it can name must exist ---------- */
console.log('\nthe worlds only reference models that are really there');
{
  const lib = path.join(FRONTEND, 'assets/models3d/lib');
  const have = new Set(fs.readdirSync(lib).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')));
  const keys = eng.worldModelKeys();
  t('the builder names some models at all', keys.length > 10, `${keys.length}`);
  const missing = keys.filter((k) => !have.has(k));
  // A key with no file loads nothing and leaves the arena bare — that is the
  // "two models on an empty disc" build a creator was shown in August.
  t('every model key resolves to a .glb on disk', missing.length === 0, missing.join(', '));
}

/* ---------- the concept decides the world ---------- */
console.log('\nthe world matches what the creator described');
{
  const w = (bp) => eng.pickWorld(bp).id;
  t('a dinosaur concept lands on the dino island',
    w({ title: 'Dino Island', summary: 'raptors hunt you', genre: ['adventure'] }) === 'dino');
  t('a space concept lands in space',
    w({ title: 'Star Drift', summary: 'collect stars in orbit', genre: ['sci-fi'] }) === 'space');
  t('a football concept lands on a pitch',
    w({ title: 'Striker', summary: 'score goals in the stadium', genre: ['sport'] }) === 'football');
  t('a night concept lands at night',
    w({ title: 'Midnight Post', summary: 'a haunted delivery in the dark', genre: [] }) === 'night');
  // Anything unmatched must still be a real place, not an empty default.
  t('an unmatched concept still gets a real world',
    ['forest', 'castle', 'sea', 'space', 'dino', 'night', 'football']
      .includes(w({ title: 'Untitled', summary: '', genre: [] })));
}

/* ---------- it is a 3D build, not the 2D one ---------- */
console.log('\nwhat it emits is unmistakably 3D');
{
  const html = eng.buildPlayable3dGame({ title: 'Dino Island', summary: 'eggs and raptors', genre: ['adventure'], language: 'en' });
  t('boots the 3D runtime', html.includes('JOSHRIX3D.boot'));
  t('loads the three vendor scripts', (html.match(/<script src="https:\/\/www\.joshrix\.com\/assets\/vendor\//g) || []).length === 3);
  // MIN_ENGINE_MODELS is 5; a build that names fewer is the bare-disc failure.
  t('names at least five library models', (html.match(/"lib\//g) || []).length >= 5,
    `${(html.match(/"lib\//g) || []).length}`);
  t('sets the sky and ground from the concept, not the defaults',
    html.includes('sky') && html.includes('ground') && html.includes('#d98244'));
  t('uses an animated actor for the hero', html.includes('G.actor('));
  t('has sound on real events', html.includes('G.sfx(') && html.includes('G.ambience('));
  t('never hand-rolls a renderer or a loop',
    !/requestAnimationFrame|new THREE\.WebGLRenderer|new THREE\.Scene\b/.test(html));
}

/* ---------- and it plays ---------- */
console.log('\nand it is actually playable (real browser, real keys)');
{
  const server = http.createServer((q, r) => {
    const p = path.join(FRONTEND, decodeURIComponent(q.url.split('?')[0]));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    const TY = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
    r.writeHead(200, { 'Content-Type': TY[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Instrumented copy, written into frontend/ only for the life of this test:
  // the game's own variables live in a closure, and an autopilot has to see the
  // world it is playing.
  const probe = path.join(FRONTEND, '__t34.html');
  let html = eng.buildPlayable3dGame({
    title: 'Dino Island', summary: 'A ranger gathers eggs on a volcanic island while raptors hunt them.',
    genre: ['adventure', 'dinosaur'], language: 'en', characters: [{ name: 'Raptor', role: 'hunter' }],
  });
  html = html.replace('var T = G.THREE;', 'var T = G.THREE; window.__G = G;')
    .replace('player.position.set(0, 0, 5); G.scene.add(player);', 'player.position.set(0, 0, 5); window.__P = player; G.scene.add(player);')
    .replace('var picks = [], foes = [], spawnTimer = 0, wave = 1;', 'var picks = [], foes = [], spawnTimer = 0, wave = 1; window.__PICKS=function(){return picks;}; window.__FOES=function(){return foes;};');
  fs.writeFileSync(probe, html);

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The build points at joshrix.com for the runtime and the models, as a
  // published game does. Serve those from disk so this tests the real file.
  await page.route('**://www.joshrix.com/**', async (route) => {
    const f = path.join(FRONTEND, new URL(route.request().url()).pathname);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    const TY = { '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
    return route.fulfill({ status: 200, contentType: TY[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });

  try {
    await page.goto(`${base}/__t34.html`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    const canvas = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? { w: c.width, h: c.height } : null;
    });
    t('a canvas is on screen with real size', !!canvas && canvas.w > 300 && canvas.h > 300, JSON.stringify(canvas));

    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,.jx-btn')].find((x) => /start/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(1200);
    t('the run starts', (await page.evaluate(() => window.__G && window.__G.state)) === 'play');
    t('the world has pickups in it', (await page.evaluate(() => window.__PICKS().length)) > 0);

    /* AUTOPILOT — steer toward the nearest pickup with the keyboard, deciding
       in camera space the way a person reading the screen would. */
    const held = new Set();
    const holdKeys = async (want) => {
      for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    };
    let best = 0;
    for (let i = 0; i < 200; i++) {
      const s = await page.evaluate(() => {
        const G = window.__G, P = window.__P, picks = window.__PICKS();
        if (!G || !P) return null;
        let b = null, bd = 1e9;
        for (const p of picks) {
          const dx = p.position.x - P.position.x, dz = p.position.z - P.position.z;
          const d = Math.hypot(dx, dz);
          if (d < bd) { bd = d; b = [dx, dz]; }
        }
        return { state: G.state, score: G.score, lives: G.lives, b,
          cam: [G.camera.position.x - P.position.x, G.camera.position.z - P.position.z] };
      });
      if (!s) break;
      best = Math.max(best, s.score);
      if (s.state !== 'play') break;
      if (s.b) {
        const yaw = Math.atan2(s.cam[0], s.cam[1]), sin = Math.sin(yaw), cos = Math.cos(yaw);
        const nx = s.b[0] * cos - s.b[1] * sin, nz = s.b[1] * cos + s.b[0] * sin;
        const want = new Set();
        if (nz < -0.4) want.add('KeyW');
        if (nz > 0.4) want.add('KeyS');
        if (nx < -0.4) want.add('KeyA');
        if (nx > 0.4) want.add('KeyD');
        await holdKeys(want);
      }
      await page.waitForTimeout(90);
    }
    await holdKeys(new Set());

    // The whole point. A world that renders but cannot be played is the thing
    // that shipped for six weeks.
    t('the keyboard moves the player and the score goes up', best > 0, `best score ${best}`);
    /* The chase, asserted by standing still and waiting to be caught.
       Measuring the gap does not work: the moment the hunter connects it is
       re-placed at the arena edge, so a snapshot taken after a hit shows the
       gap GROWING. Losing a life is the unambiguous signal, and it is
       deterministic — the hunter moves at 2.4+/s across at most 18 units, so
       it always arrives inside this window. */
    const startLives = await page.evaluate(() => window.__G.lives);
    t('there is a hunter in the world', (await page.evaluate(() => window.__FOES().length)) > 0);
    // Paced on the GAME's clock, not the wall clock. Under full-suite load this
    // browser shares a CPU with two other Playwright files and runs at a
    // fraction of real time, so a wall-clock budget measures the machine rather
    // than the game — which is exactly how t26 became intermittent. The hunter
    // needs ~8 game-seconds to cross the arena, so allow 16.
    const t0 = await page.evaluate(() => window.__G.elapsed);
    let caught = false;
    for (let i = 0; i < 240; i++) {
      const st = await page.evaluate(() => ({ lives: window.__G.lives, state: window.__G.state, el: window.__G.elapsed }));
      if (st.lives < startLives || st.state !== 'play') { caught = true; break; }
      if (st.el - t0 > 16) break;
      await page.waitForTimeout(120);
    }
    t('and it catches a player who stands still', caught,
      'the hunter never closed in 16 game-seconds — the chase is not running');

    t('no JavaScript errors during play', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(probe, { force: true });
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
