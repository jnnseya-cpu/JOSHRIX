/**
 * Generate the iOS launch images for the installed PWA.
 *
 *   NODE_PATH=<node_modules> node tools/make-splash.mjs
 *
 * Android needs none of this: Chrome composes a launch screen from the
 * manifest's background_color, name and 512px icon, which the manifest already
 * has. Safari ignores all of that. Without an explicit
 * <link rel="apple-touch-startup-image"> matching the exact device, an installed
 * PWA opens on a BLANK WHITE SCREEN for as long as the page takes to load —
 * which on a first launch, on a phone, is the worst possible first impression
 * of an app that is meant to look premium.
 *
 * Two things make this fiddly, and both are why it is generated rather than
 * hand-made:
 *
 * 1. Safari matches on exact device-width, device-height, pixel ratio AND
 *    orientation. One wrong number and that device silently falls back to the
 *    white screen — there is no partial match and no warning.
 * 2. iOS reports device-width/device-height in PORTRAIT terms in media queries
 *    regardless of how the phone is held. So a landscape entry keeps the same
 *    two numbers and only flips `orientation`, while the IMAGE it points at
 *    must be rotated. Getting that backwards produces a stretched splash on
 *    every device, which is easy to ship and hard to notice.
 *
 * The artwork is drawn from the same brand values as the email and the site, so
 * the launch screen, the icon and the first painted frame agree.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("frontend/assets/splash");

/** CSS points, portrait, as iOS reports them in media queries. */
const DEVICES = [
  { w: 320, h: 568, r: 2, name: "iphone-se1" },
  { w: 375, h: 667, r: 2, name: "iphone-8" },
  { w: 414, h: 736, r: 3, name: "iphone-8-plus" },
  { w: 375, h: 812, r: 3, name: "iphone-x" },
  { w: 414, h: 896, r: 2, name: "iphone-xr" },
  { w: 414, h: 896, r: 3, name: "iphone-xs-max" },
  { w: 390, h: 844, r: 3, name: "iphone-12" },
  { w: 428, h: 926, r: 3, name: "iphone-12-pro-max" },
  { w: 393, h: 852, r: 3, name: "iphone-15" },
  { w: 430, h: 932, r: 3, name: "iphone-15-pro-max" },
  { w: 402, h: 874, r: 3, name: "iphone-16-pro" },
  { w: 440, h: 956, r: 3, name: "iphone-16-pro-max" },
  { w: 744, h: 1133, r: 2, name: "ipad-mini" },
  { w: 810, h: 1080, r: 2, name: "ipad-10" },
  { w: 834, h: 1194, r: 2, name: "ipad-pro-11" },
  { w: 1024, h: 1366, r: 2, name: "ipad-pro-12" },
];

/** The launch screen. Sized off the SHORTER edge so the mark holds its
 *  proportion on a tablet in landscape as well as a phone in portrait. */
function html(wPx, hPx) {
  const min = Math.min(wPx, hPx);
  const mark = Math.round(min * 0.22);
  const word = Math.round(min * 0.062);
  const tag = Math.round(min * 0.030);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${wPx}px;height:${hPx}px;overflow:hidden}
  body{background:#050508;display:flex;align-items:center;justify-content:center;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#ececf4}
  /* Deliberately NO full-screen gradient. A smooth wash across 2732x2048 gives
     PNG nothing to run-length encode: the same 32 images came to 19MB with one
     and 300KB without. A launch image is downloaded before the app is usable,
     so the flat brand ground is both the faster and the more correct choice —
     it also matches manifest background_color exactly, so iOS and Android show
     the same colour. */
  .stack{position:relative;display:flex;flex-direction:column;align-items:center;gap:${Math.round(min * 0.045)}px}
  .mark{width:${mark}px;height:${mark}px;border-radius:${Math.round(mark * 0.235)}px;
        background:linear-gradient(135deg,#7C3AED,#22D3EE);
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:${Math.round(mark * 0.42)}px;color:#fff;letter-spacing:.02em;
        box-shadow:0 ${Math.round(min * 0.03)}px ${Math.round(min * 0.09)}px rgba(124,58,237,.35)}
  .word{font-size:${word}px;font-weight:800;letter-spacing:.16em}
  .word em{font-style:normal;color:#22D3EE}
  .tag{font-size:${tag}px;letter-spacing:.20em;text-transform:uppercase;color:#9d9db3}
  </style></head><body>
  <div class="stack">
    <div class="mark">JX</div>
    <div class="word">JOSHRIX <em>STUDIO</em></div>
    <div class="tag">Create · Build · Own</div>
  </div></body></html>`;
}

const media = (d, orientation) =>
  `(device-width: ${d.w}px) and (device-height: ${d.h}px) and ` +
  `(-webkit-device-pixel-ratio: ${d.r}) and (orientation: ${orientation})`;

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--proxy-bypass-list=127.0.0.1", "--proxy-server=direct://"],
});

const links = [];
let bytes = 0;

for (const d of DEVICES) {
  for (const orientation of ["portrait", "landscape"]) {
    // Device px. In landscape the image is rotated, but the media query keeps
    // the portrait device-width/height — iOS reports those, not the viewport.
    const wPx = (orientation === "portrait" ? d.w : d.h) * d.r;
    const hPx = (orientation === "portrait" ? d.h : d.w) * d.r;

    const page = await browser.newPage({ viewport: { width: wPx, height: hPx }, deviceScaleFactor: 1 });
    await page.setContent(html(wPx, hPx), { waitUntil: "load" });
    const file = `${d.name}-${orientation}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    await page.close();

    const size = fs.statSync(path.join(OUT, file)).size;
    bytes += size;
    links.push({ file, media: media(d, orientation), wPx, hPx, size });
  }
}

await browser.close();

// The link list is emitted as data, not pasted into 32 pages by hand: it is
// injected at runtime from one place, so a new page can never forget it.
fs.writeFileSync(
  path.join(OUT, "splash.json"),
  JSON.stringify(links.map(({ file, media }) => ({ file, media })), null, 0) + "\n",
);

for (const l of links) {
  console.log(`${l.file.padEnd(30)} ${String(l.wPx).padStart(5)}x${String(l.hPx).padEnd(5)} ${(l.size / 1024).toFixed(1).padStart(6)}KB`);
}
console.log(`\n${links.length} launch images, ${(bytes / 1024).toFixed(0)}KB total, written to ${OUT}`);
