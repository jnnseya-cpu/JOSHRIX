/**
 * Ingest rigged, animated characters into the model library.
 *
 *   npm i three@0.160.0
 *   node --import ./tools/gltf-export-polyfill.mjs \
 *        tools/ingest-characters.mjs <source-dir> <pack-name>
 *
 * Rigged humanoids are the scarcest thing in the whole library — 2,273 models
 * and only ten of them are people, all of them blocky. Everything else can be a
 * box with a texture; a character cannot, because the player looks at it for the
 * whole session.
 *
 * Handles the three shapes a bought character pack actually arrives in:
 *
 *   1. glTF / GLB already        — copied straight through. Quaternius ships this,
 *                                  and it is the ONLY lossless path: no reparse,
 *                                  no re-export, no texture surgery, nothing to
 *                                  get wrong. Always prefer the glTF folder.
 *   2. FBX + a texture beside it — converted, texture injected.
 *   3. FBX with the texture baked inside (Mixamo) — the image is pulled out of
 *                                  the FBX binary and injected.
 *
 * Three traps, each of which silently produces a character that looks fine in a
 * viewer and is broken in a game:
 *
 * - EVERY Mixamo clip is internally named "mixamo.com". Ask three for the clip
 *   called "run" and you get whatever happened to be first. Clips are therefore
 *   named from the FILENAME, and mapped onto the library's vocabulary
 *   (idle/walk/run/jump/attack/die) so G.actor(key, "run") works.
 * - FBX is authored in centimetres. Imported raw a Mixamo character stands ~180
 *   units tall in a world where a person is 2, so it is normalised by height.
 * - FBX UVs have a bottom-left origin, glTF a top-left one. Skip the V flip and
 *   the face lands on the back of the head — it loads clean and validates clean,
 *   which is exactly why it ships.
 */
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve(process.argv[2] || "frontend/assets/models3d/_incoming/characters");
const PACK = process.argv[3] || "characters-hd";
const OUT = path.resolve("frontend/assets/models3d/packs", PACK);
const TARGET_HEIGHT = 1.85;          // metres — lib/ puts a person at ~2 units

/** The library's clip vocabulary. A game asks for these names by hand, so a
 *  clip called "Slow Run (1)" has to become "run" or nothing will find it. */
const CLIP_ALIASES = [
  [/idle|breath|stand/i, "idle"],
  [/walk/i, "walk"],
  [/run|jog|sprint/i, "run"],
  [/jump|leap/i, "jump"],
  [/attack|punch|kick|slash|shoot/i, "attack"],
  [/death|die|dying/i, "die"],
  [/danc/i, "dance"],
];
function clipName(raw) {
  const s = String(raw || "").replace(/mixamo\.com/gi, " ").replace(/[_\-.]/g, " ");
  for (const [re, name] of CLIP_ALIASES) if (re.test(s)) return name;
  return s.trim().toLowerCase().replace(/\s+/g, "_") || "idle";
}

/** The real clip is the longest; FBX exports carry a two-keyframe "Targeting
 *  Pose" alongside it and their order is not consistent between files. */
const longest = (clips) => clips.slice().sort((a, b) => b.duration - a.duration)[0] ?? null;

/* ---------- pull an embedded image out of a binary FBX ----------
 * Mixamo bakes the skin into the FBX as a Video node. Under Node there is no
 * DOM, so three cannot decode it into a usable texture. Rather than parse the
 * FBX node tree, scan the bytes for a complete PNG or JPEG — the format is
 * self-delimiting, so this is reliable regardless of FBX version, and it fails
 * closed (returns null) instead of producing a corrupt image. */
function embeddedImage(buf) {
  const png = buf.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (png >= 0) {
    const end = buf.indexOf(Buffer.from("IEND\xae\x42\x60\x82", "binary"), png);
    if (end > png) return { data: buf.subarray(png, end + 8), mime: "image/png" };
  }
  const jpg = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (jpg >= 0) {
    for (let i = buf.length - 2; i > jpg; i--) {
      if (buf[i] === 0xff && buf[i + 1] === 0xd9) return { data: buf.subarray(jpg, i + 2), mime: "image/jpeg" };
    }
  }
  return null;
}

/* ---------- GLB surgery: append an image and point every material at it ----- */
const pad4 = (n) => (n + 3) & ~3;

function injectTexture(glb, image) {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(glb.toString("utf8", 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  const bin = glb.subarray(binStart, binStart + dv.getUint32(20 + jsonLen, true));

  // a texture without UVs is a blank skin that looks like a bug, not a warning
  const hasUv = (json.meshes || []).some((m) =>
    (m.primitives || []).some((p) => p.attributes && p.attributes.TEXCOORD_0 !== undefined));
  if (!hasUv) throw new Error("mesh has no TEXCOORD_0 — texture would not show");

  const offset = pad4(bin.length);
  const newBin = Buffer.concat([
    bin, Buffer.alloc(offset - bin.length),
    image.data, Buffer.alloc(pad4(image.data.length) - image.data.length),
  ]);

  (json.bufferViews ||= []).push({ buffer: 0, byteOffset: offset, byteLength: image.data.length });
  (json.images ||= []).push({ bufferView: json.bufferViews.length - 1, mimeType: image.mime });
  (json.samplers ||= []).push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
  (json.textures ||= []).push({ sampler: json.samplers.length - 1, source: json.images.length - 1 });
  const tex = json.textures.length - 1;

  for (const mat of json.materials || []) {
    mat.pbrMetallicRoughness ||= {};
    mat.pbrMetallicRoughness.baseColorTexture = { index: tex, texCoord: 0 };
    mat.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];   // tinting double-darkens the skin
    mat.pbrMetallicRoughness.metallicFactor = 0;
    mat.pbrMetallicRoughness.roughnessFactor = 0.85;
  }
  json.buffers = [{ byteLength: newBin.length }];

  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + newBin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonChunk, bh, newBin]);
}

/* --------------------------------- walk ---------------------------------- */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const slug = (s) => path.basename(s).replace(/\.[^.]+$/, "")
  .replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_")
  .replace(/^_|_$/g, "").toLowerCase();

/* Exported so tests can exercise the fiddly parts — clip naming, the embedded
   image scan and the GLB surgery — without running an ingest. */
export { clipName, embeddedImage, injectTexture, slug };

/* ---------------------------------- run ----------------------------------- */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!invokedDirectly) { /* imported for tests — do not ingest */ }
else if (!fs.existsSync(SRC)) {
  console.error(`nothing at ${SRC} — upload the pack there first (see its README)`);
  process.exit(1);
} else {
fs.mkdirSync(OUT, { recursive: true });

const files = walk(SRC);
const glbs = files.filter((f) => /\.glb$/i.test(f));
const fbxs = files.filter((f) => /\.fbx$/i.test(f));
const made = [], skipped = [];

/* ---- 1. GLB fast path: lossless, always preferred ---- */
for (const f of glbs) {
  const name = slug(f) + ".glb";
  fs.copyFileSync(f, path.join(OUT, name));
  made.push({ name, bytes: fs.statSync(f).size, how: "copied", clips: ["(as authored)"] });
}

/* ---- 2/3. FBX path ---- */
if (fbxs.length) {
  const loader = new FBXLoader();
  const exporter = new GLTFExporter();

  // Mixamo splits a character into one "with skin" file and N animation-only
  // files that share the same rig. An FBX with no mesh is an animation, and its
  // clip belongs to every character in the same folder.
  const shared = [];
  const bodies = [];
  for (const f of fbxs) {
    let obj;
    try { obj = loader.parse(fs.readFileSync(f).buffer, path.dirname(f) + path.sep); }
    catch (e) { skipped.push(`${path.basename(f)}: ${e.message.slice(0, 90)}`); continue; }
    let hasMesh = false;
    obj.traverse((n) => { if (n.isMesh || n.isSkinnedMesh) hasMesh = true; });
    if (hasMesh) bodies.push({ file: f, obj });
    else {
      const c = longest(obj.animations || []);
      if (c) { c.name = clipName(path.basename(f)); shared.push(c); }
    }
  }

  for (const body of bodies) {
    const { file, obj } = body;
    const own = (obj.animations || []).map((c) => { c.name = clipName(c.name); return c; })
      .filter((c) => c.duration > 0.2);          // drop the two-keyframe pose clips
    const clips = own.length ? own : shared;

    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(obj).getSize(size);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    const holder = new THREE.Group();
    holder.add(obj); holder.scale.setScalar(scale); holder.updateMatrixWorld(true);

    const flipped = new Set();
    obj.traverse((n) => {
      if (!n.isMesh && !n.isSkinnedMesh) return;
      const uv = n.geometry?.attributes?.uv;
      if (uv && !flipped.has(uv)) {
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
        uv.needsUpdate = true; flipped.add(uv);
      }
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      const conv = mats.map(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }));
      n.material = Array.isArray(n.material) ? conv : conv[0];
    });

    let out;
    try {
      out = Buffer.from(await new Promise((res, rej) =>
        exporter.parse(holder, res, rej, { binary: true, animations: clips })));
    } catch (e) { skipped.push(`${path.basename(file)}: export failed — ${e.message.slice(0, 80)}`); continue; }

    // texture: a sibling image first, then whatever is baked into the FBX
    const sibling = files.find((f) => /\.(png|jpe?g)$/i.test(f) &&
      path.dirname(f).startsWith(path.dirname(file)) && !/normal|rough|metal|ao|emis/i.test(f));
    let image = sibling
      ? { data: fs.readFileSync(sibling), mime: /\.png$/i.test(sibling) ? "image/png" : "image/jpeg" }
      : embeddedImage(fs.readFileSync(file));
    if (image) {
      try { out = injectTexture(out, image); }
      catch (e) { console.log(`  ! ${path.basename(file)}: ${e.message} — writing untextured`); }
    } else {
      console.log(`  ! ${path.basename(file)}: no texture found — writing untextured`);
    }

    const name = slug(file) + ".glb";
    fs.writeFileSync(path.join(OUT, name), out);
    made.push({ name, bytes: out.length, how: "converted", clips: clips.map((c) => c.name), scale: +scale.toFixed(4) });
  }
}

for (const m of made) {
  console.log(`${m.name.padEnd(30)} ${(m.bytes / 1024).toFixed(0).padStart(6)}KB  ${m.how.padEnd(9)} clips=${m.clips.join(",")}`);
}
if (skipped.length) {
  console.log(`\nSKIPPED (${skipped.length}) — these produced no model:`);
  for (const s of skipped) console.log("  " + s);
}
console.log(`\n${made.length} characters written to packs/${PACK}`);
console.log(`next: node tools/validate-models.mjs   then   node tools/build-model-manifest.mjs`);
if (!made.length) process.exit(1);
}
