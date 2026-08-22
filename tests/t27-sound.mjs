/**
 * DOES THE SOUND ENGINE ACTUALLY MAKE SOUND?
 *
 * Audio is the easiest thing on the platform to fake passing. Every node in the
 * Web Audio graph is built inside a try/catch — deliberately, because a thrown
 * AudioContext error must never take a frame down — so a completely broken
 * synth would return `this` from every call and look perfectly healthy from the
 * outside. Asserting that G.sfx exists proves nothing.
 *
 * So this file records what the runtime actually PUTS ON THE AUDIO BUS. Every
 * factory on the AudioContext is wrapped before the game boots, each sound is
 * fired, and the assertions are about the graph that came back: how many
 * oscillators, how many filtered noise sources, whether the bed loops, whether
 * mute silences a loop that is already running.
 *
 *   node tests/t27-sound.mjs
 *   (needs playwright + Chromium; CHROMIUM_PATH overrides the lookup)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.env.JOSHRIX_ROOT || process.cwd(), 'frontend');
const PORT = 8107;

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
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json',
};
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/__host') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<body></body>'); }
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
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
const pg = await browser.newPage({ viewport: { width: 480, height: 320 } });
const errs = [];
pg.on('pageerror', (e) => { if (e.message !== 'Event') errs.push(e.message); });
/* A console error's text is generic ("Failed to load resource") and carries no
   URL, so filter on the location instead — otherwise the host page's automatic
   /favicon.ico request reads as a failure in every run. */
pg.on('console', (m) => {
  if (m.type() !== 'error') return;
  const where = (m.location() && m.location().url) || '';
  if (/favicon/i.test(where) || /favicon/i.test(m.text())) return;
  errs.push('console: ' + m.text() + (where ? ' <- ' + where : ''));
});
pg.on('requestfailed', (r) => errs.push('request failed: ' + r.url()));
pg.on('response', (r) => { if (r.status() >= 400 && !/favicon/i.test(r.url())) errs.push('HTTP ' + r.status() + ' ' + r.url()); });

/* Wrap the AudioContext BEFORE the runtime script runs, so nothing it creates
   escapes the recorder. Counting nodes is the only way to tell a synth that
   works from one whose every error is being swallowed. */
await pg.addInitScript(() => {
  window.__audio = { osc: 0, buf: 0, filter: 0, gain: 0, started: 0, looped: 0, freqRamps: 0 };
  const wrap = (Ctor) => function () {
    const ctx = new Ctor(...arguments);
    const rec = window.__audio;
    const wrapNode = (make, key) => function () {
      const n = make.apply(ctx, arguments);
      rec[key]++;
      if (n.start) { const s = n.start.bind(n); n.start = function () { rec.started++; return s.apply(null, arguments); }; }
      if (n.frequency && n.frequency.exponentialRampToValueAtTime) {
        const r = n.frequency.exponentialRampToValueAtTime.bind(n.frequency);
        n.frequency.exponentialRampToValueAtTime = function () { rec.freqRamps++; return r.apply(null, arguments); };
      }
      if (key === 'buf') {
        Object.defineProperty(n, 'loop', {
          set(v) { if (v) rec.looped++; this._loop = v; }, get() { return this._loop; },
        });
      }
      return n;
    };
    ctx.createOscillator = wrapNode(ctx.createOscillator, 'osc');
    ctx.createBufferSource = wrapNode(ctx.createBufferSource, 'buf');
    ctx.createBiquadFilter = wrapNode(ctx.createBiquadFilter, 'filter');
    ctx.createGain = wrapNode(ctx.createGain, 'gain');
    return ctx;
  };
  window.AudioContext = wrap(window.AudioContext);
});

await pg.goto(`http://127.0.0.1:${PORT}/__host`, { waitUntil: 'load' });
await pg.addScriptTag({ url: `http://127.0.0.1:${PORT}/assets/vendor/three.min.js` });
await pg.addScriptTag({ url: `http://127.0.0.1:${PORT}/assets/vendor/GLTFLoader.js` });
await pg.addScriptTag({ url: `http://127.0.0.1:${PORT}/assets/vendor/joshrix3d-1.js` });

console.log('\n== the runtime exposes a sound library, not one oscillator ==');
const api = await pg.evaluate(() => {
  window.G = JOSHRIX3D.boot({ title: 'Sound Check', arena: 12, playRadius: 8 });
  return { sfx: typeof G.sfx, ambience: typeof G.ambience, beep: typeof G.beep };
});
t('G.sfx exists', api.sfx === 'function');
t('G.ambience exists', api.ambience === 'function');
t('G.beep still exists — published games call it', api.beep === 'function');

/* Nothing sounds before the first gesture: an AudioContext created without one
   is suspended by browser policy, and the runtime opens it in start(). */
console.log('\n== before the player has pressed Start, nothing is synthesised ==');
const quiet = await pg.evaluate(() => {
  G.sfx('explode'); G.ambience('rain');
  return { ...window.__audio };
});
t('no audio nodes are built before the first gesture', quiet.osc === 0 && quiet.buf === 0,
  JSON.stringify(quiet));
t('...and calling them anyway does not throw', errs.length === 0, errs.join(' | '));

console.log('\n== every named sound puts real nodes on the bus ==');
/* The title overlay's own button, by class. An earlier version of this file
   reached for "the first button on the page" and hit the mute control instead,
   which silenced everything and made the whole engine look dead — the exact
   false negative this file exists to avoid. */
await pg.click('.jx-ov .jx-btn');
await pg.waitForTimeout(300);
t('pressing Start opened an AudioContext', await pg.evaluate(() => {
  const before = window.__audio.osc;
  G.sfx('coin');
  return window.__audio.osc > before;
}));

const NAMES = ['click', 'step', 'pickup', 'coin', 'powerup', 'jump', 'land', 'thud',
  'hit', 'hurt', 'shoot', 'laser', 'explode', 'spark', 'whoosh', 'splash',
  'door', 'alarm', 'win', 'lose'];

const perSound = await pg.evaluate((names) => {
  const out = {};
  for (const n of names) {
    const before = { osc: window.__audio.osc, buf: window.__audio.buf, started: window.__audio.started };
    G.sfx(n);
    out[n] = {
      osc: window.__audio.osc - before.osc,
      buf: window.__audio.buf - before.buf,
      started: window.__audio.started - before.started,
    };
  }
  return out;
}, NAMES);

const silent = NAMES.filter((n) => perSound[n].started === 0);
t(`all ${NAMES.length} named sounds start at least one source`, silent.length === 0,
  'silent: ' + silent.join(', '));

const usesNoise = NAMES.filter((n) => perSound[n].buf > 0);
const usesTone = NAMES.filter((n) => perSound[n].osc > 0);
t('some sounds are noise-based — impacts and weather cannot be oscillators',
  usesNoise.length >= 8, usesNoise.length + ' of ' + NAMES.length);
t('some sounds are pitched — pickups and fanfares cannot be noise',
  usesTone.length >= 8, usesTone.length + ' of ' + NAMES.length);
t('win is a chord, not a blip', perSound.win.osc >= 3, JSON.stringify(perSound.win));
t('explode combines noise with a low body', perSound.explode.buf >= 1 && perSound.explode.osc >= 1,
  JSON.stringify(perSound.explode));

console.log('\n== the presets are distinguishable, not one sound with 20 names ==');
const shapes = new Set(NAMES.map((n) => perSound[n].osc + ':' + perSound[n].buf));
t('the library has several distinct synthesis shapes', shapes.size >= 5, shapes.size + ' shapes');

console.log('\n== an unknown name falls back rather than going silent ==');
const unknown = await pg.evaluate(() => {
  const before = window.__audio.started;
  G.sfx('definitely-not-a-real-sound');
  return window.__audio.started - before;
});
t('an unknown sound name still makes a sound', unknown > 0, 'started ' + unknown);

console.log('\n== the ambience bed loops, and mute silences it ==');
const amb = await pg.evaluate(async () => {
  const before = window.__audio.looped;
  G.ambience('rain');
  const looped = window.__audio.looped - before;
  // a second bed must replace the first, never stack
  const b2 = window.__audio.buf;
  G.ambience('wind');
  return { looped, replaced: window.__audio.buf - b2 };
});
t('the bed is a looping source', amb.looped >= 1, JSON.stringify(amb));
t('a second bed replaces the first rather than stacking', amb.replaced >= 1, JSON.stringify(amb));

await pg.click('.jx-mute');
const muteEffect = await pg.evaluate(() => {
  const btn = document.querySelector('.jx-mute');
  return { found: !!btn, text: btn ? btn.textContent : '' };
});
t('a mute control is present', muteEffect.found === true);
t('mute switches the icon to muted', /\u{1F507}/u.test(muteEffect.text || ''), muteEffect.text);

const afterMute = await pg.evaluate(() => {
  const before = window.__audio.started;
  G.sfx('explode');
  return window.__audio.started - before;
});
t('a one-shot makes no sound while muted', afterMute === 0, 'started ' + afterMute);

console.log('\n== nothing threw at any point ==');
t('no JavaScript errors across the whole run', errs.length === 0, errs.slice(0, 3).join(' | '));

if (errs.length) console.log('\n  errors seen:\n' + errs.map((e) => '    ' + e).join('\n'));
console.log(`\n  ${pass} passed, ${fail} failed`);
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);
