/**
 * Bring a pack's embedded textures inside a web-deliverable byte budget.
 *
 *   node tools/shrink-textures.mjs <pack-name> [--max 1024] [--quality 0.9] [--dry]
 *
 * Bought character packs are authored for Unity and Unreal, where a 4096px PNG
 * normal map is unremarkable. In a browser it is fatal: one Quaternius fantasy
 * outfit arrived as a 39MB GLB carrying six 4K PNGs, and 24 of them came to
 * 738MB — more than the entire rest of the library. A player on a phone would
 * never finish downloading a single character.
 *
 * The mesh, skeleton and animation clips are untouched. Only the images are
 * rewritten, because they are the whole of the excess: geometry in these packs
 * is a few hundred KB.
 *
 * There is no image library in this stack and there should not be one for this
 * — Chromium is already installed for the model validator and the game tests,
 * and it decodes PNG, resamples and encodes JPEG natively. So the resize runs
 * in a real browser through OffscreenCanvas.
 *
 * PNG is kept only where the alpha channel actually carries information (hair
 * cards, foliage). Everything else becomes JPEG: normal and ORM maps included,
 * which is a deliberate quality trade — at 1024px on a mobile GPU the ringing
 * is invisible and the download is 40x smaller.
 *
 * Re-running is safe: an image already inside the budget is left alone, so the
 * tool is idempotent and can be pointed at a pack after a partial run.
 */
import fs from "node:fs";
import path from "node:path";
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
    console.error("playwright not found. Install it, or run with:\n" +
      "  NODE_PATH=/path/to/node_modules node tools/shrink-textures.mjs <pack>");
    process.exit(1);
  }
}

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const PACK = argv.find((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a));
const MAX = flag("max", 1024);
const QUALITY = flag("quality", 0.9);
const DRY = argv.includes("--dry");

if (!PACK) {
  console.error("usage: node tools/shrink-textures.mjs <pack-name> [--max 1024] [--quality 0.9] [--dry]");
  process.exit(1);
}
const DIR = path.resolve("frontend/assets/models3d/packs", PACK);
if (!fs.existsSync(DIR)) {
  console.error("no such pack: " + DIR);
  process.exit(1);
}

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const pad4 = (n) => (n + 3) & ~3;

/** Split a GLB into its JSON and binary chunks. Returns null for anything that
 *  is not a GLB, so a pack that mixes .gltf in is skipped rather than corrupted. */
function readGlb(buf) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) return null;
  let off = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === JSON_CHUNK) json = JSON.parse(body.toString("utf8"));
    else if (type === BIN_CHUNK) bin = body;
    off += 8 + pad4(len);
  }
  return json ? { json, bin } : null;
}

/** Rebuild the container. Every bufferView is copied out and re-laid-out in
 *  order, so a changed image length shifts everything after it correctly.
 *  Accessor byteOffsets are relative to their bufferView and untouched, and
 *  each view starts 4-byte aligned, which is what strided accessors require. */
function writeGlb(json, bin, replaced) {
  const parts = [];
  let cursor = 0;
  for (let i = 0; i < json.bufferViews.length; i++) {
    const bv = json.bufferViews[i];
    const data = replaced.has(i)
      ? replaced.get(i)
      : bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    bv.byteOffset = cursor;
    bv.byteLength = data.length;
    parts.push(data);
    const pad = pad4(data.length) - data.length;
    if (pad) parts.push(Buffer.alloc(pad));
    cursor += pad4(data.length);
  }
  const newBin = Buffer.concat(parts);
  json.buffers = [{ byteLength: newBin.length }];

  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = pad4(jsonBuf.length) - jsonBuf.length;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const total = 12 + 8 + jsonChunk.length + 8 + newBin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(out, 20);
  const binAt = 20 + jsonChunk.length;
  out.writeUInt32LE(newBin.length, binAt);
  out.writeUInt32LE(BIN_CHUNK, binAt + 4);
  newBin.copy(out, binAt + 8);
  return out;
}

const kb = (n) => (n / 1024).toFixed(0).padStart(6) + "KB";

// Same pinned binary the model validator uses — the bundled Playwright download
// is deliberately absent in this image.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--use-gl=swiftshader"],
});
const page = await browser.newPage();

/* Decode, resample and re-encode inside the browser. Alpha is sampled rather
 * than assumed: a PNG with a fully opaque alpha channel is extremely common in
 * these packs and costs 4x the bytes of the JPEG that replaces it. */
async function recode(bytes, mime, max, quality) {
  const b64 = bytes.toString("base64");
  const res = await page.evaluate(
    async ({ b64, mime, max, quality }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: mime }));
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, h);

      let hasAlpha = false;
      if (mime === "image/png") {
        const px = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < px.length; i += 4) {
          if (px[i] < 250) { hasAlpha = true; break; }
        }
      }
      const outMime = hasAlpha ? "image/png" : "image/jpeg";
      const blob = await canvas.convertToBlob({ type: outMime, quality });
      const out = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < out.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
      }
      return { b64: btoa(s), mime: outMime, w, h, from: [bmp.width, bmp.height] };
    },
    { b64, mime, max, quality },
  );
  return { data: Buffer.from(res.b64, "base64"), mime: res.mime, w: res.w, h: res.h, from: res.from };
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".glb")).sort();
let before = 0;
let after = 0;
let touched = 0;

for (const file of files) {
  const full = path.join(DIR, file);
  const raw = fs.readFileSync(full);
  before += raw.length;
  const glb = readGlb(raw);
  if (!glb || !glb.json.images?.length) {
    after += raw.length;
    continue;
  }
  const { json, bin } = glb;
  const replaced = new Map();

  for (const img of json.images) {
    if (img.bufferView === undefined) continue;
    const bv = json.bufferViews[img.bufferView];
    const src = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const out = await recode(src, img.mimeType || "image/png", MAX, QUALITY);
    // Keep whichever is smaller. A texture already inside the budget re-encodes
    // to roughly its own size, and this is what makes re-running a no-op.
    if (out.data.length < src.length) {
      replaced.set(img.bufferView, out.data);
      img.mimeType = out.mime;
    }
  }

  if (!replaced.size) {
    after += raw.length;
    continue;
  }
  const next = writeGlb(json, bin, replaced);
  after += next.length;
  touched++;
  console.log(
    "  " + file.padEnd(34) + kb(raw.length) + " -> " + kb(next.length) +
    "  (" + replaced.size + " textures)",
  );
  if (!DRY) fs.writeFileSync(full, next);
}

await browser.close();

console.log(
  "\n" + PACK + ": " + touched + "/" + files.length + " models rewritten, " +
  (before / 1048576).toFixed(0) + "MB -> " + (after / 1048576).toFixed(0) + "MB" +
  (DRY ? "  (dry run, nothing written)" : ""),
);
