/**
 * The launch screen is the very first thing an installed user sees, and every
 * way it fails is silent:
 *
 *   - Safari matches on exact device-width, device-height, pixel ratio AND
 *     orientation. One wrong number and that device falls back to a blank white
 *     screen. There is no partial match, no console warning, nothing to notice.
 *   - The device table lives in TWO places by necessity — tools/make-splash.mjs
 *     writes the images, frontend/assets/appnav.js writes the links — so the
 *     real risk is not a bad number, it is the two drifting apart.
 *   - iOS reports device-width/height in PORTRAIT terms regardless of how the
 *     device is held, so a landscape image must be ROTATED while its media
 *     query keeps the portrait numbers. Getting that backwards stretches the
 *     splash on every device.
 *
 * So this asserts the two tables against each other and both against the actual
 * pixels on disk.
 *
 *   node tests/t19-splash.js
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO = process.env.JOSHRIX_ROOT || path.join(__dirname, '..');
const SPLASH = path.join(REPO, 'frontend/assets/splash');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

/** Read a [w, h, dpr, "name"] table out of a source file. */
function devicesIn(file) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8');
  const out = [];
  // matches both the JS array form and the object form in the generator
  for (const m of src.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d)\s*,\s*"([a-z0-9-]+)"\s*\]/g)) {
    out.push({ w: +m[1], h: +m[2], r: +m[3], name: m[4] });
  }
  for (const m of src.matchAll(/\{\s*w:\s*(\d+),\s*h:\s*(\d+),\s*r:\s*(\d),\s*name:\s*"([a-z0-9-]+)"\s*\}/g)) {
    out.push({ w: +m[1], h: +m[2], r: +m[3], name: m[4] });
  }
  return out;
}

/** PNG dimensions from the IHDR chunk — no image library needed. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const gen = devicesIn('tools/make-splash.mjs');
const nav = devicesIn('frontend/assets/splash.js');

console.log('\n== the two device tables must agree ==');
t('the generator declares devices', gen.length >= 12, `${gen.length}`);
t('splash.js declares the same number', nav.length === gen.length, `generator ${gen.length}, splash.js ${nav.length}`);
{
  const key = (d) => `${d.w}x${d.h}@${d.r}:${d.name}`;
  const g = new Set(gen.map(key)), n = new Set(nav.map(key));
  const missingInNav = [...g].filter((k) => !n.has(k));
  const missingInGen = [...n].filter((k) => !g.has(k));
  t('every generated device has links in splash.js', missingInNav.length === 0, missingInNav.join(', '));
  t('every device splash.js links has generated images', missingInGen.length === 0,
    missingInGen.join(', ') + ' — these would 404 and fall back to a white screen');
}

console.log('\n== every declared device has both images, at the right pixel size ==');
{
  let bad = [], total = 0, bytes = 0;
  for (const d of gen) {
    for (const orientation of ['portrait', 'landscape']) {
      const file = path.join(SPLASH, `${d.name}-${orientation}.png`);
      if (!fs.existsSync(file)) { bad.push(`${d.name}-${orientation}.png missing`); continue; }
      total++; bytes += fs.statSync(file).size;
      const got = pngSize(file);
      // portrait = w*dpr by h*dpr; landscape is the SAME image rotated
      const want = orientation === 'portrait'
        ? { w: d.w * d.r, h: d.h * d.r }
        : { w: d.h * d.r, h: d.w * d.r };
      if (got.w !== want.w || got.h !== want.h) {
        bad.push(`${d.name}-${orientation}: ${got.w}x${got.h}, expected ${want.w}x${want.h}`);
      }
    }
  }
  t(`all ${gen.length * 2} images exist at exactly the right size`, bad.length === 0, bad.slice(0, 4).join(' | '));
  t('landscape images are wider than tall', gen.every((d) => {
    const f = path.join(SPLASH, `${d.name}-landscape.png`);
    if (!fs.existsSync(f)) return false;
    const s = pngSize(f); return s.w > s.h;
  }), 'a portrait image served for landscape is stretched on every device');
  t('portrait images are taller than wide', gen.every((d) => {
    const f = path.join(SPLASH, `${d.name}-portrait.png`);
    if (!fs.existsSync(f)) return false;
    const s = pngSize(f); return s.h > s.w;
  }));
  const avg = bytes / Math.max(1, total);
  t('a device downloads a reasonably sized image', avg < 250 * 1024,
    `average ${(avg / 1024).toFixed(0)}KB — a launch image is fetched before the app is usable`);
}

console.log('\n== the media queries splash.js writes ==');
{
  const src = fs.readFileSync(path.join(REPO, 'frontend/assets/splash.js'), 'utf8');
  t('links are apple-touch-startup-image', src.includes('apple-touch-startup-image'));
  t('the query pins device-width, device-height, dpr and orientation',
    /device-width.*device-height.*webkit-device-pixel-ratio.*orientation/s.test(src),
    'Safari needs all four or it shows nothing');
  t('both orientations are emitted', /portrait/.test(src) && /landscape/.test(src));
  t('hrefs are root-absolute so a nested page still resolves them',
    src.includes('"/assets/splash/"'),
    'a relative path breaks on /games/x.html and on /blog/<slug>');
  t('it does not re-inject over links a page already declares',
    src.includes('querySelector(\'link[rel="apple-touch-startup-image"]\')'));
  t('injection is guarded so it can never break the page',
    /try \{ splash\(\); \} catch/.test(src));
}

console.log('\n== every installable page actually loads it ==');
{
  // A page that declares the manifest is installable, and an installable page
  // without these links opens on a white screen. Game pages are the ones that
  // matter most: a shared game link is the likeliest place somebody installs.
  const html = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f); else if (e.name.endsWith('.html')) html.push(f);
    }
  })(path.join(REPO, 'frontend'));

  const installable = html.filter((f) => fs.readFileSync(f, 'utf8').includes('manifest.webmanifest'));
  const missing = installable.filter((f) => !fs.readFileSync(f, 'utf8').includes('/assets/splash.js'));
  t(`all ${installable.length} installable pages load splash.js`, missing.length === 0,
    missing.map((f) => path.relative(REPO, f)).join(', '));
  t('the reference games are installable', ['wonderverse', 'dino-island'].every((g) =>
    installable.some((f) => f.includes(g))),
    'a shared game link is the most likely install point');
  t('splash.js is loaded, not inlined per page',
    installable.every((f) => (fs.readFileSync(f, 'utf8').match(/apple-touch-startup-image/g) || []).length === 0),
    'a per-page copy of the table is exactly the drift this file exists to prevent');
}

console.log('\n== the manifest still covers Android ==');
{
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'frontend/manifest.webmanifest'), 'utf8'));
  t('background_color is set — this IS the Android launch screen', !!m.background_color, m.background_color);
  t('a 512px icon exists for the Android launch mark',
    (m.icons || []).some((i) => i.sizes === '512x512'));
  t('display is standalone, or there is no launch screen at all', m.display === 'standalone', m.display);
  // The iOS art is painted on this exact colour; if they differ the launch
  // screen and the first painted frame flash two different backgrounds.
  const src = fs.readFileSync(path.join(REPO, 'tools/make-splash.mjs'), 'utf8');
  t('the iOS artwork uses the same background as the manifest',
    src.toLowerCase().includes(String(m.background_color).toLowerCase()),
    `manifest says ${m.background_color}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
