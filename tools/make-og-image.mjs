#!/usr/bin/env node
/**
 * Render the Open Graph share card to frontend/assets/og-cover.png.
 *
 *   node tools/make-og-image.mjs
 *
 * WHY THIS EXISTS. Not one page on this site carried an og:image, so every link
 * pasted into WhatsApp, a Discord server, X, LinkedIn or Slack rendered as bare
 * blue text. The landing page's own argument is that JOSHRIX wins "the queue,
 * the group chat, the fanbase drop" — a shared link is the primary acquisition
 * channel, and it was the one surface with no design on it at all.
 *
 * It composes the existing hero cast render rather than drawing something new,
 * so the card shows six real models from the library. 1200x630 is the size every
 * platform crops from; anything smaller gets upscaled and looks soft.
 *
 * PNG, not WebP: X and LinkedIn still refuse WebP og:image in 2026, and a card
 * that fails on two of the four platforms that matter is not a card.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "frontend");
const OUT = path.join(WEB, "assets", "og-cover.png");

const cast = fs.readFileSync(path.join(WEB, "assets", "hero-cast.webp")).toString("base64");
const fontFile = fs.readdirSync(path.join(WEB, "assets", "fonts"))
  .find((f) => /archivo/i.test(f) && f.endsWith(".woff2"));
const font = fontFile
  ? fs.readFileSync(path.join(WEB, "assets", "fonts", fontFile)).toString("base64")
  : null;

const html = `<!doctype html><meta charset="utf-8">
<style>
  ${font ? `@font-face{font-family:'Archivo';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900;font-display:block}` : ""}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#07080B;overflow:hidden;position:relative;
    font-family:'Archivo',system-ui,'Segoe UI',Roboto,sans-serif;color:#EDEFF3}
  /* The cast sits along the bottom, lit as it was rendered. A gradient lifts the
     type off it rather than a box, which would read as a caption. */
  /* The cast sits on the RIGHT and bleeds off the edge, so the type has a clean
     column of its own. Bottom-anchored full width put the sub-headline directly
     on top of a zombie, which is the kind of thing only a render shows you. */
  .cast{position:absolute;right:-170px;bottom:6px;width:1180px;
    -webkit-mask-image:linear-gradient(90deg,transparent,#000 26%);
    mask-image:linear-gradient(90deg,transparent,#000 26%)}
  .veil{position:absolute;inset:0;
    background:linear-gradient(90deg,#07080B 34%,rgba(7,8,11,.72) 52%,transparent 76%)}
  .copy{position:absolute;left:72px;top:74px;width:600px}
  .mark{display:flex;align-items:center;gap:14px;margin-bottom:30px}
  .mark svg{width:34px;height:34px}
  .name{font-weight:700;font-size:23px;letter-spacing:-.01em}
  .name em{display:block;font-style:normal;font-weight:400;font-size:11px;letter-spacing:.24em;
    color:#6A7180;margin-top:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  h1{font-size:58px;font-weight:700;letter-spacing:-.028em;line-height:1.04;max-width:13ch}
  p{margin-top:20px;font-size:22px;line-height:1.45;color:#A2A8B5;max-width:26ch}
  .rule{position:absolute;left:72px;bottom:42px;z-index:2;display:flex;gap:26px;align-items:center;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#6A7180}
  .rule b{color:#EDEFF3;font-weight:500}
  .dot{width:6px;height:6px;border-radius:50%;background:#D92D3F}
</style>
<img class="cast" src="data:image/webp;base64,${cast}">
<div class="veil"></div>
<div class="copy">
  <div class="mark">
    <svg viewBox="-50 -50 100 100">
      <polygon points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22" fill="none" stroke="#D92D3F" stroke-width="7" stroke-linejoin="round"/>
      <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="#D92D3F"/>
    </svg>
    <div class="name">JOSHRIX<em>STUDIO</em></div>
  </div>
  <h1>Create Worlds. Build Games. Own the Future.</h1>
  <p>Describe a game in any language. Play it in a browser tab. Own it outright.</p>
</div>
<div class="rule">
  <span class="dot"></span><span><b>2,591</b> models included</span>
  <span><b>£0.32</b> of compute a game</span>
  <span><b>100%</b> creator-owned</span>
</div>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT, type: "png" });
await browser.close();

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`og-cover.png  1200x630  ${kb} KB`);
/* Every platform rejects or silently drops a card over ~5MB, and a slow card is
   a card that does not render before the message is read. */
if (kb > 900) { console.error(`too heavy at ${kb} KB — recompose or lower the cast resolution`); process.exit(1); }
