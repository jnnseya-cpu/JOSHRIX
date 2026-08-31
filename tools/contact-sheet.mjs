/**
 * Render models to a single image so a human can LOOK at them.
 *
 *   node tools/contact-sheet.mjs <pack> [out.png] [--all]
 *
 * validate-models.mjs proves a model parses and has geometry. It cannot see
 * that a character is pure white because its texture was never found, or that
 * an ingest rebuilt every material flat — both of which happened on the first
 * real FBX run, on models that passed validation 2,584 out of 2,584.
 *
 * "Loads" and "looks right" are different claims. This makes the second one
 * checkable in one glance instead of by opening models one at a time.
 *
 * Renders on a mid-grey ground so a white model and a black one are both
 * obvious against it, under the same three-light rig the game runtime uses, so
 * what you see here is what a player would see.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch {
  const extra = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
  try { ({ chromium } = createRequire(path.join(extra[0] || process.cwd(), "noop.js"))("playwright")); }
  catch { console.error("playwright not found; run with NODE_PATH=/path/to/node_modules"); process.exit(1); }
}

const ROOT = path.resolve("frontend");
const PACK = process.argv[2];
const OUT = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : `${PACK}-contact-sheet.png`;
const ALL = process.argv.includes("--all");
const CELL = 220, COLS = 6;

if (!PACK) { console.error("usage: node tools/contact-sheet.mjs <pack> [out.png] [--all]"); process.exit(1); }
const dir = path.join(ROOT, "assets/models3d/packs", PACK);
if (!fs.existsSync(dir)) { console.error(`no pack at ${dir}`); process.exit(1); }

let models = fs.readdirSync(dir).filter((f) => f.endsWith(".glb")).sort();
if (!models.length) { console.error(`${PACK} holds no .glb`); process.exit(1); }
/* Without --all, take an even spread rather than the first N: the first N is
   alphabetical, which on these packs means six variants of the same character
   and no evidence about the rest. */
if (!ALL && models.length > 36) {
  const step = models.length / 36;
  models = Array.from({ length: 36 }, (_, i) => models[Math.floor(i * step)]);
}

const TYPES = { ".html": "text/html", ".js": "application/javascript", ".glb": "model/gltf-binary", ".png": "image/png" };
const PORT = 8934;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const browser = await chromium.launch({
  // same pinned binary validate-models.mjs uses — this environment provides
  // Chromium rather than letting playwright download its own
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: CELL * COLS, height: CELL * Math.ceil(models.length / COLS) } });
page.on("console", (m) => { if (m.type() === "error") console.log("  browser:", m.text().slice(0, 120)); });

await page.goto(`http://127.0.0.1:${PORT}/assets/vendor/three.min.js`).catch(() => {});
/* The cells live in their own container: with the canvases as direct children
   of a grid body, the two <script> elements take grid cells of their own and
   shove every model one place out of position. */
await page.setContent(
  `<body style="margin:0;background:#7a7a80">` +
  `<div id="sheet" style="display:grid;grid-template-columns:repeat(${COLS},${CELL}px)"></div>` +
  `<script src="http://127.0.0.1:${PORT}/assets/vendor/three.min.js"></script>` +
  `<script src="http://127.0.0.1:${PORT}/assets/vendor/GLTFLoader.js"></script></body>`,
  { waitUntil: "networkidle" });

if (!await page.evaluate(() => typeof THREE !== "undefined" && !!THREE.GLTFLoader)) {
  console.error("three.js or GLTFLoader failed to load"); process.exit(1);
}

console.log(`rendering ${models.length} of ${fs.readdirSync(dir).filter((f) => f.endsWith(".glb")).length} models from ${PACK}…`);

const failed = await page.evaluate(async ({ port, pack, files, cell }) => {
  const bad = [];
  const sheet = document.getElementById("sheet");

  /* ONE WebGL context for the whole sheet, copied into a 2D canvas per cell.
     A renderer per cell looks fine for the first dozen and then Chromium hits
     its live-context cap and evicts the OLDEST — so the earliest models go
     silently blank while the last ones look perfect, which reads exactly like
     "the first twenty models are broken". */
  const gl = document.createElement("canvas");
  gl.width = gl.height = cell;
  const r = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
  r.setClearColor(0x7a7a80, 1);
  r.setSize(cell, cell, false);
  if ("outputColorSpace" in r) r.outputColorSpace = THREE.SRGBColorSpace;

  for (const file of files) {
    const holder = document.createElement("div");
    holder.style.cssText = `position:relative;width:${cell}px;height:${cell}px`;
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = cell;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = "#7a7a80"; ctx.fillRect(0, 0, cell, cell);
    // the name under each model, so a wrong one can actually be named back
    const tag = document.createElement("div");
    tag.textContent = file.replace(/\.glb$/, "");
    tag.style.cssText = "position:absolute;left:0;right:0;bottom:2px;text-align:center;"
      + "font:10px system-ui;color:#fff;text-shadow:0 1px 2px #000;overflow:hidden;white-space:nowrap";
    holder.appendChild(cvs); holder.appendChild(tag); sheet.appendChild(holder);
    try {
      const gltf = await new Promise((res, rej) =>
        new THREE.GLTFLoader().load(`http://127.0.0.1:${port}/assets/models3d/packs/${pack}/${file}`, res, undefined, rej));
      const scene = new THREE.Scene();
      scene.add(gltf.scene);

      // the runtime's own lighting, so the sheet shows what a player sees
      scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 6, 4); scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-4, 2, -3); scene.add(fill);

      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z) || 1;
      const cam = new THREE.PerspectiveCamera(35, 1, span / 100, span * 100);
      cam.position.set(mid.x + span * 1.5, mid.y + span * 0.55, mid.z + span * 2.0);
      cam.lookAt(mid);

      r.render(scene, cam);
      ctx.drawImage(gl, 0, 0);
      gltf.scene.traverse((n) => { n.geometry?.dispose?.(); });
    } catch (e) {
      bad.push(file + ": " + String(e && e.message || e).slice(0, 90));
      // a failure is drawn, not left looking like an empty cell
      ctx.fillStyle = "#c0392b"; ctx.fillRect(0, 0, cell, cell);
    }
  }
  r.dispose();
  return bad;
}, { port: PORT, pack: PACK, files: models, cell: CELL });

await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
server.close();

if (failed.length) {
  console.log(`\n${failed.length} failed to render:`);
  for (const f of failed.slice(0, 10)) console.log("  " + f);
}
console.log(`\nwrote ${OUT}`);
