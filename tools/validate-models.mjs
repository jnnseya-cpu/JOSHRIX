/**
 * Load every model in the manifest through the real GLTFLoader in a real
 * browser, and record what actually came back.
 *
 *   node tools/validate-models.mjs [--write]
 *
 * A model that 404s, or parses but contains no geometry, is worse than a
 * missing one: the forge will happily reference it and the player gets an
 * invisible object. This is the gate that stops that reaching production.
 *
 * With --write, the measured height, footprint and animation clip names are
 * merged back into manifest.json, so the Code Agent can scale a scene from
 * data instead of guessing (guessing is what made the first Dino Island build
 * render its characters as specks on a field).
 *
 * Exits non-zero if any model fails, so CI can depend on it.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

// Playwright is a heavy dev-only dependency and deliberately not in package.json
// (it would ship to Vercel). Resolve it from wherever it is installed; ESM
// import ignores NODE_PATH, so this has to go through require.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  const extra = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
  const req = createRequire(path.join(extra[0] || process.cwd(), "noop.js"));
  try {
    ({ chromium } = req("playwright"));
  } catch {
    console.error("playwright not found. Install it, or run with:\n" +
      "  NODE_PATH=/path/to/node_modules node tools/validate-models.mjs");
    process.exit(1);
  }
}

const ROOT = path.resolve("frontend");
const MANIFEST = path.join(ROOT, "assets/models3d/manifest.json");
const WRITE = process.argv.includes("--write");
const PORT = 8931;

const TYPES = {
  ".html": "text/html", ".js": "application/javascript",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg",
};

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const jobs = [];
for (const [pack, p] of Object.entries(manifest.packs || {})) {
  for (const m of p.models || []) jobs.push({ pack, file: m.file });
}
if (!jobs.length) { console.error("manifest lists no models"); process.exit(1); }
console.log(`Validating ${jobs.length} models from ${Object.keys(manifest.packs).length} packs…`);

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; return res.end("not found");
  }
  res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
  res.end(fs.readFileSync(file));
}).listen(PORT, "127.0.0.1");

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--proxy-bypass-list=127.0.0.1"],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/assets/vendor/three.min.js`).catch(() => {});
await page.setContent(
  `<body><script src="http://127.0.0.1:${PORT}/assets/vendor/three.min.js"></script>` +
  `<script src="http://127.0.0.1:${PORT}/assets/vendor/GLTFLoader.js"></script></body>`,
  { waitUntil: "load" },
);

const ready = await page.evaluate(() => typeof THREE !== "undefined" && !!THREE.GLTFLoader);
if (!ready) { console.error("three.js or GLTFLoader failed to load — cannot validate"); process.exit(1); }

const results = [];
const CHUNK = 40;
for (let i = 0; i < jobs.length; i += CHUNK) {
  const batch = jobs.slice(i, i + CHUNK);
  const out = await page.evaluate(async ({ files, port }) => {
    const loader = new THREE.GLTFLoader();
    const res = [];
    for (const f of files) {
      try {
        const g = await new Promise((ok, bad) =>
          loader.load(`http://127.0.0.1:${port}/assets/models3d/${f}`, ok, undefined,
            () => bad(new Error("load failed (404 or corrupt)"))));
        let meshes = 0, tris = 0;
        g.scene.traverse((n) => {
          if (!n.isMesh || !n.geometry) return;
          meshes++;
          const idx = n.geometry.index;
          const pos = n.geometry.attributes.position;
          tris += Math.floor((idx ? idx.count : pos ? pos.count : 0) / 3);
        });
        const box = new THREE.Box3().setFromObject(g.scene);
        const s = new THREE.Vector3();
        const finite = isFinite(box.min.x) && isFinite(box.max.x);
        if (finite) box.getSize(s);
        res.push({
          file: f, ok: meshes > 0 && finite && s.y + s.x + s.z > 0,
          meshes, tris,
          height: finite ? +s.y.toFixed(3) : 0,
          width: finite ? +s.x.toFixed(3) : 0,
          depth: finite ? +s.z.toFixed(3) : 0,
          clips: (g.animations || []).map((a) => a.name),
          error: meshes === 0 ? "parsed but contains no mesh geometry"
               : !finite ? "geometry has no finite bounding box" : null,
        });
      } catch (e) {
        res.push({ file: f, ok: false, error: String(e && e.message || e) });
      }
    }
    return res;
  }, { files: batch.map((b) => b.file), port: PORT });
  results.push(...out);
  process.stdout.write(`\r  ${results.length}/${jobs.length}`);
}
process.stdout.write("\n");

await browser.close();
server.close();

const bad = results.filter((r) => !r.ok);
const animated = results.filter((r) => r.ok && r.clips && r.clips.length);
const tris = results.reduce((s, r) => s + (r.tris || 0), 0);

console.log(`\n  loaded     ${results.length - bad.length}/${results.length}`);
console.log(`  animated   ${animated.length}`);
console.log(`  triangles  ${tris.toLocaleString()} total, ${Math.round(tris / Math.max(1, results.length - bad.length))} avg`);
if (bad.length) {
  console.log(`\n  FAILED (${bad.length}):`);
  for (const b of bad.slice(0, 40)) console.log(`    ${b.file} — ${b.error}`);
  if (bad.length > 40) console.log(`    …and ${bad.length - 40} more`);
}

if (WRITE) {
  const byFile = new Map(results.map((r) => [r.file, r]));
  for (const p of Object.values(manifest.packs)) {
    for (const m of p.models) {
      const r = byFile.get(m.file);
      if (!r || !r.ok) continue;
      m.height = r.height; m.width = r.width; m.depth = r.depth; m.tris = r.tris;
      if (r.clips.length) m.clips = r.clips; else delete m.clips;
    }
    // never advertise a model that does not load
    p.models = p.models.filter((m) => byFile.get(m.file)?.ok);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n  manifest updated with measured dimensions (${bad.length} failing models removed)`);
}

process.exit(bad.length ? 1 : 0);
