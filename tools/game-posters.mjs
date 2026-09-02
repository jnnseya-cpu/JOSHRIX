#!/usr/bin/env node
/**
 * Capture a real frame from each reference game and write it to
 * frontend/assets/posters/ as WebP.
 *
 *   node tools/game-posters.mjs
 *
 * WHY THIS EXISTS. The landing page used to advertise its playable demo with a
 * 🦖 emoji on a flat panel. An emoji is a placeholder wearing a product's
 * clothes: it tells a visitor nothing about whether the thing is worth
 * clicking, and on a games site the one question that matters is "what does it
 * actually look like". A frame from the running game answers that, and because
 * it is captured from the game rather than drawn, it cannot quietly stop being
 * true the way an illustration can.
 *
 * The games load their vendor scripts from absolute https://www.joshrix.com
 * URLs so that a published game keeps working wherever it is embedded. Those
 * requests are intercepted and served from disk — this environment cannot reach
 * joshrix.com, and a poster generated against the live site would silently
 * capture whatever is deployed rather than what is in this working tree.
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "frontend");
const OUT = path.join(WEB, "assets", "posters");
const PORT = 4655;

const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2",
  ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
};
const mime = (f) => MIME[path.extname(f)] || "application/octet-stream";

/* Each game gets the seconds it needs before the frame is worth keeping: the
   runtime streams GLB models in, and a shot taken too early is an empty field.
   `settle` is measured, not guessed — raise it if a poster comes out bare. */
const GAMES = [
  { id: "midnight-post", settle: 6000 },
  { id: "dino-island", settle: 5000 },
  { id: "wonderverse", settle: 5000 },
];

const W = 1200, H = 750;

const serve = () =>
  new Promise((resolve) => {
    const srv = http.createServer((q, s) => {
      let p = decodeURIComponent(q.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      let f = path.join(WEB, p);
      if (!fs.existsSync(f) && fs.existsSync(f + ".html")) f += ".html";
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end("nf"); }
      s.writeHead(200, { "content-type": mime(f) });
      fs.createReadStream(f).pipe(s);
    });
    srv.listen(PORT, () => resolve(srv));
  });

const srv = await serve();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

fs.mkdirSync(OUT, { recursive: true });
let failed = 0;

/* PNG in, WebP out. A blank page is used purely as an encoder — there is no
   image library in this repo's dependencies and a poster is not worth adding
   one for when a browser is already open. */
const encoder = await browser.newPage();
await encoder.goto("about:blank");
const encodeWebp = (png) =>
  encoder.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.86);
  }, png.toString("base64"));

for (const g of GAMES) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.route("**www.joshrix.com/**", (route) => {
    const f = path.join(WEB, new URL(route.request().url()).pathname);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "nf" });
    route.fulfill({ status: 200, headers: { "content-type": mime(f) }, body: fs.readFileSync(f) });
  });

  await page.goto(`http://localhost:${PORT}/games/${g.id}.html`, { waitUntil: "load" });
  await page.waitForTimeout(g.settle);

  /* The runtime opens on a start overlay. A poster of a menu sells a menu. */
  await page
    .evaluate(() => {
      const hit = [...document.querySelectorAll("button,[class*=start]")]
        .find((e) => /start|play|begin/i.test(e.textContent || ""));
      if (hit) hit.click();
    })
    .catch(() => {});
  await page.waitForTimeout(g.settle);

  /* The frame is taken with page.screenshot rather than canvas.toDataURL. The
     runtime creates its WebGL context without preserveDrawingBuffer, so reading
     the canvas back yields a blank image once the browser has composited the
     frame — toDataURL "succeeds" and returns nothing, which is how an empty
     poster ships. The compositor's own capture is always the drawn frame, and
     it also includes the game's HUD, which is part of what the poster is for. */
  const png = await page.screenshot({ type: "png" });
  const webp = await encodeWebp(png);

  if (!webp || webp.length < 5000) {
    console.error(`  FAIL ${g.id} — no canvas frame captured`);
    failed++;
  } else {
    const file = path.join(OUT, `${g.id}.webp`);
    fs.writeFileSync(file, Buffer.from(webp.split(",")[1], "base64"));
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`  ok   ${g.id}  ${kb} KB${errors.length ? `  (${errors.length} console errors)` : ""}`);
    if (errors.length) console.log(`       ${errors.slice(0, 2).join(" | ")}`);
  }
  await page.close();
}

await browser.close();
srv.close();

/* A poster that failed to capture leaves the previous file in place, which is
   exactly how a stale image survives unnoticed. Fail the run instead. */
if (failed) { console.error(`\n${failed} poster(s) failed`); process.exit(1); }
console.log(`\n${GAMES.length} posters written to frontend/assets/posters/`);
