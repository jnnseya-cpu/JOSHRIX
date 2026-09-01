/**
 * Screenshot pages of the site, so a design change is judged by looking at it.
 *
 *   node tools/page-shots.mjs                     every page, desktop
 *   node tools/page-shots.mjs index pricing       just these
 *   node tools/page-shots.mjs --mobile            390px wide instead
 *   node tools/page-shots.mjs --out shots/before  where they go
 *
 * The lesson from the model library applies to the site too: a page can load
 * perfectly, pass every test, and look wrong. 2,591 models validated green
 * while every one of them was exporting untextured. Nothing catches that
 * except looking, and looking at 33 pages by hand is not something that gets
 * done twice.
 *
 * Serves frontend/ over loopback so relative paths, fonts and the stylesheet
 * resolve exactly as they do in production.
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
const args = process.argv.slice(2);
const MOBILE = args.includes("--mobile");
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : "shots";
const named = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");

const pages = named.length ? named
  : fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, ""))
      // play/play3d need a game id and embed-demo needs a host page; they render
      // empty shells on their own and tell you nothing about the design
      .filter((p) => !["play", "play3d", "embed-demo", "doc"].includes(p));

fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".json": "application/json", ".glb": "model/gltf-binary",
  ".webp": "image/webp", ".ico": "image/x-icon",
};
const PORT = 8937;
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  let f = path.join(ROOT, rel);
  // cleanUrls: true in vercel.json — /pricing serves pricing.html
  if (!fs.existsSync(f) && fs.existsSync(f + ".html")) f += ".html";
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  deviceScaleFactor: MOBILE ? 2 : 1,
});

const problems = [];
page.on("pageerror", (e) => problems.push(`  js error: ${String(e.message).slice(0, 110)}`));
page.on("response", (r) => { if (r.status() >= 400) problems.push(`  ${r.status()} ${r.url().replace(`http://127.0.0.1:${PORT}`, "")}`); });

for (const name of pages) {
  problems.length = 0;
  const file = path.join(OUT, `${name}${MOBILE ? "-mobile" : ""}.png`);
  try {
    await page.goto(`http://127.0.0.1:${PORT}/${name}`, { waitUntil: "networkidle", timeout: 20000 });
    // the reveal-on-scroll classes leave content invisible until it is scrolled
    // past, which would screenshot as a blank page
    await page.evaluate(() => {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: file, fullPage: true });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`${name.padEnd(16)} ${String(h).padStart(6)}px${problems.length ? "  ⚠" : ""}`);
    for (const p of [...new Set(problems)].slice(0, 4)) console.log(p);
  } catch (e) {
    console.log(`${name.padEnd(16)} FAILED — ${String(e.message).split("\n")[0].slice(0, 90)}`);
  }
}

await browser.close();
server.close();
console.log(`\n${pages.length} page(s) → ${OUT}/`);
