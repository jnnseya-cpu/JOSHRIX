/**
 * Render real library models into one transparent image for the landing page.
 *
 *   node tools/hero-render.mjs [out.png]
 *
 * The hero had an empty right half and, before that, an aurora and a
 * starfield. The most convincing thing a platform that ships 2,591 game-ready
 * models can put there is 2,591 game-ready models — actually rendered, not
 * illustrated. Nothing here is a mock-up: every figure is a GLB a creator gets,
 * lit by the same three-light rig the game runtime uses, so the picture cannot
 * drift from the product.
 *
 * It renders a SCENE, not a line-up. Six figures on a flat strip is a catalogue
 * page; what a games platform needs above the fold is key art. So the cast is
 * staged in depth on a ground plane, lit the way a film unit lights: a hard key
 * from behind-left throwing long shadows toward camera, a cold ambient fill in
 * the shadows, and a hot signal-red rim picking out every silhouette against
 * the dark. Fog falls off with distance so the back of the frame recedes.
 *
 * Transparent background, so the page's own ground shows through and the image
 * costs nothing when the palette changes.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.error("playwright not found"); process.exit(1); }

const ROOT = path.resolve("frontend");
const OUT = process.argv[2] || "frontend/assets/hero-cast.webp";

/* A cast, not a catalogue: one of each thing the forge builds with, chosen to
   read at a glance and to sit together without looking like a line-up. */
const CAST = [
  /* Chosen for how they read, not for what they are. Models fall into three
     groups: textured, vertex-coloured, and flat material colour — and the
     third group in these packs is genuinely dark. The Dinosaur pack's own
     materials are #131612 and #4b4729, deliberate olive and brown that a game
     lights properly but a product shot renders as a silhouette. That is the
     asset, not a fault, and it is not what a hero image is for.
     `yaw` turns each figure off square: winged models seen head-on show their
     wings edge-on as grey blades, and everything reads better in three-quarter. */
  { file: "packs/quaternius-characters/knight_golden_male.glb", scale: 1.00, y: 0.02, yaw: -0.5 },
  { file: "packs/quaternius-fbx/zombie.glb",             scale: 1.00, y: 0.02, yaw: 0.4 },
  { file: "packs/quaternius-fbx/robot.glb",              scale: 0.95, y: 0.01, yaw: 0.2 },
  { file: "packs/quaternius-monsters/armabee.glb",       scale: 0.80, y: 0.02, yaw: 2.3 },
  { file: "packs/quaternius-fbx/cow.glb",                scale: 0.78, y: 0.00, yaw: -1.1 },
  { file: "packs/kenney-carkit/race.glb",                scale: 0.95, y: 0.00, yaw: -0.7 },
];

const TYPES = { ".glb": "model/gltf-binary", ".js": "application/javascript", ".json": "application/json", ".html": "text/html" };
const PORT = 8965;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

/* 21:9. A letterbox is the cheapest cinematic signal there is, and it happens
   to be the shape the space under a hero headline actually wants. */
const W = 2100, H = 620;
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
page.on("console", (m) => { if (m.type() === "error") console.log("  browser:", m.text().slice(0, 120)); });

await page.goto(`http://127.0.0.1:${PORT}/assets/vendor/three.min.js`).catch(() => {});
await page.setContent(
  `<body style="margin:0;background:transparent">` +
  `<canvas id=c width="${W}" height="${H}"></canvas>` +
  `<script src="http://127.0.0.1:${PORT}/assets/vendor/three.min.js"></script>` +
  `<script src="http://127.0.0.1:${PORT}/assets/vendor/GLTFLoader.js"></script></body>`,
  { waitUntil: "networkidle" });

if (!await page.evaluate(() => typeof THREE !== "undefined" && !!THREE.GLTFLoader)) {
  console.error("three.js failed to load"); process.exit(1);
}

const missing = await page.evaluate(async ({ port, cast, W, H }) => {
  const bad = [];
  /* Load EVERY model before drawing anything. Awaiting between draws yields to
     the event loop, the browser composites, and WebGL discards the drawing
     buffer — so each render wiped the ones before it and only the last figure
     survived. preserveDrawingBuffer belts the braces. */
  const loaded = [];
  for (const spec of cast) {
    try {
      const g = await new Promise((res, rej) =>
        new THREE.GLTFLoader().load(`http://127.0.0.1:${port}/assets/models3d/${spec.file}`, res, undefined, rej));
      loaded.push({ spec, gltf: g });
    } catch (e) { bad.push(spec.file); }
  }

  const r = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setClearColor(0x000000, 0);
  r.setSize(W, H, false);
  r.setPixelRatio(2);
  if ("outputColorSpace" in r) r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  if ("toneMapping" in r) { r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; }

  const scene = new THREE.Scene();

  /* KEY — hard, from behind and to the left, so shadows rake toward camera.
     Front-lighting is what makes a render look like a product photo. */
  const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
  key.position.set(-9, 11, -6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16; key.shadow.camera.right = 16;
  key.shadow.camera.top = 16; key.shadow.camera.bottom = -16;
  key.shadow.camera.near = 1; key.shadow.camera.far = 60;
  key.shadow.bias = -0.0012;
  scene.add(key);

  // AMBIENT — cold, and weak. Shadows that go blue are the whole grade.
  scene.add(new THREE.HemisphereLight(0x9FB4D8, 0x07080B, 0.46));

  // RIM — the signal red, low and behind, separating every silhouette
  const rim = new THREE.DirectionalLight(0xD92D3F, 3.0);
  rim.position.set(10, 3.2, -5.5);
  scene.add(rim);

  // a soft warm bounce from camera-right so the fronts are not black
  const bounce = new THREE.DirectionalLight(0xE8CBB4, 0.62);
  bounce.position.set(6, 3, 8);
  scene.add(bounce);

  /* A LIT floor plane is the wrong tool: near the camera it catches the fill and
     the rim and comes out a pale mauve slab with visible edges, which is the
     opposite of cinematic. ShadowMaterial renders ONLY where something is in
     shadow and is transparent everywhere else — so the cast throws real,
     raking shadows onto the page's own ground with no rectangle around them. */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.ShadowMaterial({ opacity: 0.72 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* Stage the cast along a shallow arc rather than a line, with the tallest
     figures set back. A line-up is a catalogue; an arc is a scene. */
  const N = loaded.length;
  const SPREAD = 13.5;
  for (let i = 0; i < N; i++) {
    const { spec, gltf } = loaded[i];
    const o = gltf.scene;
    o.traverse((n) => { if (n.isMesh || n.isSkinnedMesh) { n.castShadow = true; n.receiveShadow = true; } });

    // normalise every model to a common height, then apply its own scale — the
    // packs are built at wildly different scales and a raw composite is chaos
    const b0 = new THREE.Box3().setFromObject(o);
    const s0 = b0.getSize(new THREE.Vector3());
    const unit = 2.0 / (s0.y || 1);
    o.scale.setScalar(unit * (spec.scale || 1));

    const b1 = new THREE.Box3().setFromObject(o);
    const t = N === 1 ? 0.5 : i / (N - 1);
    o.position.x = (t - 0.5) * SPREAD;
    o.position.z = -Math.abs(t - 0.5) * 5.2;      // the arc: ends pushed back
    o.position.y = -b1.min.y;                      // stand every figure on the floor
    o.rotation.y = spec.yaw || 0;
    scene.add(o);
  }

  /* A low camera looking slightly up is heroic; a high one is a diagram. */
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.5, 200);
  cam.position.set(0.5, 1.55, 12.4);
  cam.lookAt(0, 1.02, -1.0);
  r.render(scene, cam);
  return bad;
}, { port: PORT, cast: CAST, W, H });

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (OUT.endsWith(".webp")) {
  const data = await page.evaluate(() => document.getElementById("c").toDataURL("image/webp", 0.9));
  fs.writeFileSync(OUT, Buffer.from(data.split(",")[1], "base64"));
} else {
  await page.locator("#c").screenshot({ path: OUT, omitBackground: true });
}
await browser.close();
server.close();

if (missing.length) console.log(`could not load: ${missing.join(", ")}`);
console.log(`${CAST.length - missing.length}/${CAST.length} rendered -> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
