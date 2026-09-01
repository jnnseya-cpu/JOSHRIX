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

const CELL = 300, H = 420;
const W = CELL * CAST.length;
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

const missing = await page.evaluate(async ({ port, cast, W, H, CELL }) => {
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
  r.setScissorTest(true);

  for (let i = 0; i < loaded.length; i++) {
    const { spec, gltf } = loaded[i];
    const scene = new THREE.Scene();
    gltf.scene.rotation.y = spec.yaw || 0;
    scene.add(gltf.scene);
    // the runtime's rig, so the cast is lit the way the games are
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5f6a, 1.35));
    const key = new THREE.DirectionalLight(0xfff2e2, 1.9); key.position.set(4, 7, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9d2e0, 0.55); fill.position.set(-5, 2, -4); scene.add(fill);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z) || 1;
    const cam = new THREE.PerspectiveCamera(30, CELL / H, span / 100, span * 100);
    // a shallow three-quarter view: face-on reads as a spec sheet, and the
    // slight downward angle is how a player actually sees a character
    const d = (span * 2.6) / spec.scale;
    cam.position.set(mid.x + d * 0.55, mid.y + d * 0.30, mid.z + d * 0.85);
    cam.lookAt(mid.x, mid.y - size.y * spec.y, mid.z);

    const x = i * CELL;   // cells are laid out by draw order, not by cast index
    r.setViewport(x, 0, CELL, H);
    r.setScissor(x, 0, CELL, H);
    r.render(scene, cam);
  }
  return bad;
}, { port: PORT, cast: CAST, W, H, CELL });

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
