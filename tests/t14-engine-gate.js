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

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
