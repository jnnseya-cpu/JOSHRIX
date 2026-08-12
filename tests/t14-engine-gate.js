/**
 * The 3D acceptance gates were loosened so builds on the hosted JOSHRIX3D
 * runtime are accepted. That runtime owns the canvas, the shadow map and the
 * fog, so none of those strings appear in a game's own source and the literal
 * checks would reject exactly the builds most likely to work.
 *
 * Loosening an acceptance gate is how bad output starts shipping, so this
 * pins the new behaviour: engine builds pass, non-engine builds face the old
 * strict bar unchanged, and merely NAMING the engine is not a way through.
 *
 *   node tests/t14-engine-gate.js      (expects ./build/_gateway.js)
 */
const G = require('./build/_gateway.js');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

console.log('\n== 3D acceptance gates: JOSHRIX3D runtime ==');

const ENGINE = `<!DOCTYPE html><html><head>
<script src="https://www.joshrix.com/assets/vendor/three.min.js"></script>
<script src="https://www.joshrix.com/assets/vendor/GLTFLoader.js"></script>
<script src="https://www.joshrix.com/assets/vendor/joshrix3d-1.js"></script>
</head><body><script>
var G = JOSHRIX3D.boot({ title: "Test", arena: 24 });
G.load("hero", "lib/guardian", { height: 1.9 });
G.onUpdate(function (g, dt) { g.score += 0; });
</script></body></html>`;

// what a hand-written build has to show to be accepted
const HANDWRITTEN_GOOD = `<html><body><script>
var r = new THREE.WebGLRenderer(); r.shadowMap.enabled = true;
document.body.appendChild(r.domElement);
scene.fog = new THREE.Fog(0x7fb0c8, 30, 95);
var t = new THREE.CanvasTexture(c);
loader.load("https://www.joshrix.com/assets/models3d/lib/guardian.glb", ok);
</script></body></html>`;

const HANDWRITTEN_BARE = `<html><body><script>
var r = new THREE.WebGLRenderer();
document.body.appendChild(r.domElement);
scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
</script></body></html>`;

// names the file but never boots it — must NOT be treated as an engine build
const NAME_ONLY = `<html><head>
<script src="https://www.joshrix.com/assets/vendor/joshrix3d-1.js"></script>
</head><body><script>
var scene = new THREE.Scene();
</script></body></html>`;

t('engine build is recognised', G.usesEngine(ENGINE));
t('engine build looks playable', G.looksPlayable(ENGINE));
t('hand-written build is not mistaken for an engine build', !G.usesEngine(HANDWRITTEN_GOOD));
t('naming the engine without booting it is NOT an engine build',
  !G.usesEngine(NAME_ONLY),
  'a build could otherwise skip the whole fidelity floor by adding one script tag');
t('a build that only mentions boot() in prose is not an engine build',
  !G.usesEngine('<html><body>call JOSHRIX3D.boot() to start</body></html>'));

// the floor itself is not exported; exercise it through the public behaviour we
// can see — usesEngine is the sole exemption, so assert the pieces it gates on
t('engine source carries neither shadowMap nor Fog literals',
  !/shadowMap\s*\.\s*enabled\s*=\s*true/.test(ENGINE) && !/new\s+THREE\.Fog/.test(ENGINE),
  'if it did, this test would prove nothing about the exemption');
t('engine source never appends a domElement itself',
  !/appendChild\s*\(\s*\w+\s*\.\s*domElement\s*\)/.test(ENGINE));

t('bare hand-written build still fails the old fidelity bar',
  !/shadowMap\s*\.\s*enabled\s*=\s*true/.test(HANDWRITTEN_BARE) && !G.usesEngine(HANDWRITTEN_BARE),
  'a bare build must not slip through by any route');

t('good hand-written build still satisfies the old bar',
  /shadowMap\s*\.\s*enabled\s*=\s*true/.test(HANDWRITTEN_GOOD) &&
  /new\s+THREE\.Fog/.test(HANDWRITTEN_GOOD) &&
  /models3d\/(lib|vehicles|packs)\/|CanvasTexture/.test(HANDWRITTEN_GOOD));

/* ------------------------------------------------------------------ *
 * The engine floor.
 *
 * Exempting engine builds from the fidelity floor entirely — the first
 * version of this change — meant a build that called boot() and then did
 * nothing passed every gate and shipped. The runtime rendered its empty
 * default world forever and the player got a green field and a button.
 * That reached a real user. These assertions exist so it cannot again.
 * ------------------------------------------------------------------ */
console.log('\n== engine floor: booting the runtime is not the same as building a game ==');

const BARE_BOOT = `<html><head>
<script src="https://www.joshrix.com/assets/vendor/joshrix3d-1.js"></script>
</head><body><script>
var G = JOSHRIX3D.boot({ title: "WonderVerse", tagline: "Restore the colours" });
</script></body></html>`;

// The reference game lives in the repo, not next to the compiled test output.
// JOSHRIX_ROOT lets the audit workspace point at it; default is the repo layout.
const REPO = process.env.JOSHRIX_ROOT || require('node:path').join(__dirname, '..');
const REAL_GAME = require('node:fs')
  .readFileSync(require('node:path').join(REPO, 'frontend', 'games', 'dino-island.html'), 'utf8');

const bareMissing = G.missing3dFloor(BARE_BOOT);
t('a bare boot() with no game is REJECTED', bareMissing.length > 0, 'this is exactly what shipped to a user');
t('and the rejection says what is missing', /update/.test(bareMissing.join(' ')), bareMissing.join(' | '));

t('the real reference game PASSES the engine floor',
  G.missing3dFloor(REAL_GAME).length === 0,
  G.missing3dFloor(REAL_GAME).join(' | '));

t('a build with a world but no update loop is rejected',
  G.missing3dFloor(BARE_BOOT.replace('var G =', 'var G2 = 0; var G =')
    .replace('});', '}); G.load("h","lib/guardian",{height:1.9}); G.follow(x);')).length > 0,
  'scenery without a loop is a diorama, not a game');

t('a hand-written 3D build still faces the ORIGINAL floor',
  G.missing3dFloor(HANDWRITTEN_BARE).length > 0,
  'the engine exemption must not leak to non-engine builds');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
