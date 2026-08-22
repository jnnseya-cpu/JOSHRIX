/**
 * Decode every sprite in a real browser and record its true dimensions.
 *
 *   node tools/validate-sprites.mjs [--write]
 *
 * A PNG that is truncated, zero-byte or secretly a Thumbs.db will still sit in
 * the folder looking fine. In a game it becomes an invisible player or a broken
 * image icon, and nothing upstream notices. This is the gate that catches it.
 *
 * With --write it produces frontend/assets/sprites/manifest.json carrying each
 * sprite's real width and height, so the Code Agent can size and place art from
 * data rather than guessing.
 *
 * Exits non-zero if any sprite fails to decode.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  const extra = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
  try {
    ({ chromium } = createRequire(path.join(extra[0] || process.cwd(), "noop.js"))("playwright"));
  } catch {
    console.error("playwright not found. Run with:\n  NODE_PATH=/path/to/node_modules node tools/validate-sprites.mjs");
    process.exit(1);
  }
}

const ROOT = path.resolve("frontend");
const SPRITES = path.join(ROOT, "assets/sprites");
const MANIFEST = path.join(SPRITES, "manifest.json");
const WRITE = process.argv.includes("--write");
const PORT = 8961;

if (!fs.existsSync(SPRITES)) { console.error("no frontend/assets/sprites"); process.exit(1); }

const packs = fs.readdirSync(SPRITES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const jobs = [];
for (const pack of packs) {
  for (const f of fs.readdirSync(path.join(SPRITES, pack))) {
    if (f.toLowerCase().endsWith(".png")) jobs.push({ pack, file: `${pack}/${f}` });
  }
}
if (!jobs.length) { console.error("no sprites found"); process.exit(1); }
console.log(`Validating ${jobs.length} sprites from ${packs.length} packs…`);

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  // a blank host page, so the browser is on a real HTML document and same-origin
  // with the sprites — navigating straight to a PNG leaves it in an image viewer
  if (url === "/" || url === "/host") {
    res.setHeader("Content-Type", "text/html");
    return res.end("<!doctype html><title>sprite validator</title><body></body>");
  }
  const file = path.join(ROOT, url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; return res.end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "image/png");
  res.end(fs.readFileSync(file));
}).listen(PORT, "127.0.0.1");

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--proxy-bypass-list=127.0.0.1"],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/host`, { waitUntil: "load" });

const results = [];
const CHUNK = 120;
for (let i = 0; i < jobs.length; i += CHUNK) {
  const batch = jobs.slice(i, i + CHUNK).map((j) => j.file);
  const out = await page.evaluate(async ({ files, port }) => {
    const res = [];
    for (const f of files) {
      // decode() rejects on a corrupt PNG where onload alone can be optimistic
      const img = new Image();
      img.src = `http://127.0.0.1:${port}/assets/sprites/${f}`;
      try {
        await img.decode();
        const ok = img.naturalWidth > 0 && img.naturalHeight > 0;
        res.push({ file: f, ok, w: img.naturalWidth, h: img.naturalHeight,
                   error: ok ? null : "decoded to zero dimensions" });
      } catch (e) {
        res.push({ file: f, ok: false, w: 0, h: 0, error: "failed to decode" });
      }
    }
    return res;
  }, { files: batch, port: PORT });
  results.push(...out);
  process.stdout.write(`\r  ${results.length}/${jobs.length}`);
}
process.stdout.write("\n");

await browser.close();
server.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n  decoded   ${results.length - bad.length}/${results.length}`);
if (bad.length) {
  console.log(`\n  FAILED (${bad.length}):`);
  for (const b of bad.slice(0, 30)) console.log(`    ${b.file} — ${b.error}`);
  if (bad.length > 30) console.log(`    …and ${bad.length - 30} more`);
}

if (WRITE) {
  const byPack = {};
  for (const r of results.filter((x) => x.ok)) {
    const [pack, file] = [r.file.split("/")[0], r.file.split("/").slice(1).join("/")];
    (byPack[pack] ||= []).push({ file, w: r.w, h: r.h });
  }
  const manifest = {
    base: "https://www.joshrix.com/assets/sprites/",
    licence: "CC0 1.0 — Kenney (kenney.nl). See LICENSE.txt in each pack.",
    packs: Object.fromEntries(Object.entries(byPack).map(([k, v]) => [k, { sprites: v.sort((a, b) => a.file.localeCompare(b.file)) }])),
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n  wrote ${path.relative(process.cwd(), MANIFEST)} (${results.length - bad.length} sprites)`);
}

process.exit(bad.length ? 1 : 0);
