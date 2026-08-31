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
import { resolveAsset } from "./_assets.mjs";

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
  [/attack|punch|kick|slash|shoot|bite/i, "attack"],
  [/death|die|dying/i, "die"],
  [/danc/i, "dance"],
  // added once real Quaternius FBX went through: these clips exist in the
  // packs and had no name a game could ask for
  [/swim/i, "swim"],
  [/fly|flap/i, "fly"],
  [/crawl/i, "crawl"],
  [/sit/i, "sit"],
  [/pick\s*up|grab/i, "pickup"],
];
function clipName(raw) {
  /* Blender exports a clip as "Armature|Sitting" and Quaternius' zombie as
     "Zombie|ZombieBite" — the rig's name, a pipe, then the clip. Left in, the
     name never matches an alias and a game asking for "sit" finds nothing, so
     the prefix goes before anything else is decided. */
  const s = String(raw || "").replace(/^.*\|/, "")
    .replace(/mixamo\.com/gi, " ").replace(/[_\-.]/g, " ");
  for (const [re, name] of CLIP_ALIASES) if (re.test(s)) return name;
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "idle";
}

/* A preview render is not a skin. Injecting one as a character's texture is
 * worse than shipping it untextured, and the artist's "TextureTutorial.png"
 * sits in the same folder as the real map. */
const NOT_A_SKIN = /preview|thumb|screenshot|render|banner|logo|tutorial|normal|rough|metal|_ao\b|emis|specular|opacity/i;

/**
 * Find the texture a model actually uses.
 *
 * Quaternius puts the model in `<pack>/FBX/` and its texture in `<pack>/` or
 * `<pack>/Blends/` — never beside the model. The original search required the
 * image to live under the FBX's OWN directory, so it matched nothing, for
 * every pack: all 159 characters exported with no texture at all and the
 * zombie shipped white despite its ZombieTexture.png being right there.
 *
 * So climb to the PACK and search that, preferring a texture named after the
 * model — "ZombieTexture.png" for Zombie.fbx rather than a packmate's map.
 *
 * The climb has to stop at the pack or it does real damage. Climbing to the
 * drop folder gave the Alien, whose pack ships no texture at all, some other
 * pack's skin; climbing one level from `Old/` would put a fish texture on a
 * cat. A supplier marks the boundary for us: a pack is the folder holding the
 * format directories, so the first ancestor containing an `FBX/` or `Blends/`
 * is where the search runs and stops. A pack with no texture returns null,
 * which is the honest answer.
 */
const FORMAT_DIR = /^(fbx|gltf|glb|obj|blend|blends|textures?|source|sources)$/i;

/* Names a supplier gives a map that covers the whole model, as opposed to one
   prop on it. "ClothedDarkSkin" and "ZombieTexture" qualify; "Tie" does not. */
const WHOLE_BODY_MAP = /texture|skin|albedo|basecolou?r|diffuse|colou?r|atlas|palette/i;

function findTexture(file, files, root) {
  const key = slug(file);
  const score = (f) => {
    const b = slug(f);
    return (b.includes(key) || key.includes(b)) ? 2 : 0;
  };
  const stop = path.resolve(root);
  let dir = path.resolve(path.dirname(file));
  for (;;) {
    // the pack is whichever comes first: a folder holding format directories,
    // or a direct child of the drop folder (a pack that keeps its models loose
    // has no FBX/ to recognise it by)
    const atPack = dir === stop || path.dirname(dir) === stop
      || fs.readdirSync(dir, { withFileTypes: true })
        .some((e) => e.isDirectory() && FORMAT_DIR.test(e.name));
    if (atPack) {
      const here = files.filter((f) => /\.(png|jpe?g)$/i.test(f)
        && path.resolve(f).startsWith(dir + path.sep)
        && !NOT_A_SKIN.test(path.basename(f)));
      if (!here.length) return null;
      here.sort((a, b) => score(b) - score(a) || a.length - b.length);
      /* A texture must be named for the model, or name itself as a whole-body
         map. "Animated Men Characters" ships exactly one usable PNG — Tie.png,
         the map for a tie — so "the pack's only image" is not good enough: it
         stretched a tie over an entire character and produced a white man
         wearing a dark smear. An unrelated image is worse than none, because
         without one the model at least keeps its own material colours. */
      return score(here[0]) > 0 || WHOLE_BODY_MAP.test(path.basename(here[0]))
        ? here[0] : null;
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Two clips that both resolve to "idle" leave one of them unreachable — a
 *  game looks a clip up by name and gets whichever the loader saw first. Keep
 *  the longest for each name, which is the fully authored one rather than a
 *  stub or a transition. */
function dedupeClips(clips) {
  const best = new Map();
  for (const c of clips) {
    const prev = best.get(c.name);
    if (!prev || c.duration > prev.duration) best.set(c.name, c);
  }
  return [...best.values()];
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


/* ---------- pack a .gltf (+ .bin + loose textures) into a single .glb ----------
 * The runtime loads "<name>.glb" — it appends the extension itself — so a pack
 * that ships .gltf + .bin + a textures folder cannot be used as-is no matter how
 * correct it is. Converting it by loading it into three and re-exporting would
 * work, but every re-export is a chance to lose a bone, a clip or a UV set.
 *
 * This instead does the one thing glTF was designed to allow: it MOVES the bytes
 * without decoding them. Buffers are concatenated, bufferView offsets rebased,
 * external images appended and pointed at by bufferView instead of by URI. The
 * mesh, the skeleton and the animations are copied verbatim, so a rig that
 * worked before is byte-identical after. */
/* ---------- repair a known-broken source material ----------
 *
 * Quaternius' Nov 2019 character export writes the "Skin" material as
 * baseColorFactor 0.013410447165369987 on all three channels — sRGB #1F1F1F,
 * i.e. black. It is the same constant in 48 of the pack's 52 characters, so it
 * is an export fault, not art direction: the four that differ are the goblins
 * and zombies, whose green and grey skins came through correctly.
 *
 * Left alone it makes the largest human cast in the library render with black
 * faces and black hands. Every other material in the pack — hair, clothing,
 * belts, armour — is correct, so the whole defect is this one number.
 *
 * The replacement is not invented. It is the skin tone the same artist ships in
 * the 2022 Modular Men and Modular Women packs, byte-identical across both, so
 * the repaired 2019 cast matches the rest of the library exactly.
 *
 * Matched on the exact constant rather than on "is it dark", because plenty of
 * materials here are meant to be near-black: Black, Visor, Eye_Black, Hair.
 */
const BROKEN_SKIN = 0.013410447165369987;
const QUATERNIUS_SKIN = [0.6172067523002625, 0.4178851246833801, 0.23839758336544037];

function repairMaterials(json) {
  let fixed = 0;
  for (const m of json.materials || []) {
    if (!/^skin$/i.test(m.name || "")) continue;
    const c = m.pbrMetallicRoughness?.baseColorFactor;
    if (!c || !c.slice(0, 3).every((v) => Math.abs(v - BROKEN_SKIN) < 1e-9)) continue;
    m.pbrMetallicRoughness.baseColorFactor = [...QUATERNIUS_SKIN, c[3] ?? 1];
    fixed++;
  }
  return fixed;
}

/* Remove every material slot pointing at an image that could not be read, so
 * the exported GLB contains no reference to a file that is not inside it.
 * Indices are left alone deliberately — deleting an entry from images[] would
 * silently repoint every texture after it at the wrong picture. */
const TEX_SLOTS = ["baseColorTexture", "metallicRoughnessTexture"];
function detachImage(json, imageIndex) {
  const dead = new Set((json.textures || [])
    .map((t, i) => (t.source === imageIndex ? i : -1)).filter((i) => i >= 0));
  if (!dead.size) return;
  for (const m of json.materials || []) {
    for (const s of ["normalTexture", "occlusionTexture", "emissiveTexture"]) {
      if (m[s] && dead.has(m[s].index)) delete m[s];
    }
    const p = m.pbrMetallicRoughness;
    if (!p) continue;
    for (const s of TEX_SLOTS) if (p[s] && dead.has(p[s].index)) delete p[s];
  }
}

function packGltf(gltfPath, index) {
  const dir = path.dirname(gltfPath);
  const json = JSON.parse(fs.readFileSync(gltfPath, "utf8"));
  repairMaterials(json);

  const readUri = (uri) => {
    if (/^data:/i.test(uri)) return Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
    const at = resolveAsset(dir, uri, index);
    if (!at) throw new Error(`referenced file not found: ${uri}`);
    return fs.readFileSync(at);
  };

  const chunks = [];
  let total = 0;
  const push = (buf) => {
    const at = total;
    chunks.push(buf);
    total += buf.length;
    const pad = pad4(total) - total;
    if (pad) { chunks.push(Buffer.alloc(pad)); total += pad; }
    return at;
  };

  // 1. every buffer becomes one buffer, and each remembers where it landed
  const base = (json.buffers || []).map((b) => push(b.uri ? readUri(b.uri) : Buffer.alloc(0)));

  // 2. rebase every view onto the merged buffer
  for (const v of json.bufferViews || []) {
    v.byteOffset = (v.byteOffset || 0) + base[v.buffer || 0];
    v.buffer = 0;
  }

  // 3. external images move in as views; a GLB may not reference a file
  const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
  for (const [i, img] of (json.images || []).entries()) {
    if (img.bufferView !== undefined || !img.uri) continue;
    let data, mime;
    // A missing texture must not sink the model — but leaving the uri in place
    // ships a GLB that fetches a file which does not exist, so every character
    // built from the pack 404s on load. Detach the slot instead: the material
    // renders without that one map, which is a visible-quality decision, not a
    // broken asset.
    try { data = readUri(img.uri); }
    catch { detachImage(json, i); continue; }
    mime = /^data:/i.test(img.uri)
      ? (img.uri.slice(5, img.uri.indexOf(";")) || "image/png")
      : (MIME[path.extname(img.uri).toLowerCase()] || "image/png");
    const at = push(data);
    (json.bufferViews ||= []).push({ buffer: 0, byteOffset: at, byteLength: data.length });
    img.bufferView = json.bufferViews.length - 1;
    img.mimeType = mime;
    delete img.uri;
  }

  const bin = Buffer.concat(chunks, total);
  json.buffers = [{ byteLength: bin.length }];

  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonChunk, bh, bin]);
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
export { clipName, embeddedImage, injectTexture, slug, packGltf, repairMaterials, resolveAsset, detachImage, dedupeClips, findTexture };

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
const gltfs = files.filter((f) => /\.gltf$/i.test(f));
const fbxs = files.filter((f) => /\.fbx$/i.test(f));
const made = [], skipped = [];

/* ---- 1. GLB fast path: lossless, always preferred ---- */
for (const f of glbs) {
  const name = slug(f) + ".glb";
  fs.copyFileSync(f, path.join(OUT, name));
  made.push({ name, bytes: fs.statSync(f).size, how: "copied", clips: ["(as authored)"] });
}

/* ---- 1b. .gltf + .bin + loose textures: packed, not re-encoded ---- */
for (const f of gltfs) {
  const name = slug(f) + ".glb";
  try {
    const out = packGltf(f, files);
    fs.writeFileSync(path.join(OUT, name), out);
    made.push({ name, bytes: out.length, how: "packed", clips: ["(as authored)"] });
  } catch (e) { skipped.push(`${path.basename(f)}: ${e.message.slice(0, 90)}`); }
}

/* ---- 2/3. FBX path ----
 * A pack that ships BOTH formats writes the same slug twice, and because this
 * runs after the lossless paths the FBX conversion silently overwrote the
 * authored glTF with a re-exported, re-scaled, UV-flipped copy of itself. The
 * lossless output always wins. */
const lossless = new Set(made.map((m) => m.name));
if (fbxs.length) {
  const loader = new FBXLoader();
  const exporter = new GLTFExporter();

  // Mixamo splits a character into one "with skin" file and N animation-only
  // files that share the same rig. An FBX with no mesh is an animation, and its
  // clip belongs to every character in the same folder.
  const shared = [];
  const bodies = [];
  for (const f of fbxs) {
    if (lossless.has(slug(f) + ".glb")) { skipped.push(`${path.basename(f)}: glTF already ingested — FBX is the duplicate`); continue; }
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
    const clips = dedupeClips(own.length ? own : shared);

    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(obj).getSize(size);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    const holder = new THREE.Group();
    holder.add(obj); holder.scale.setScalar(scale); holder.updateMatrixWorld(true);

    /* A model with no UV coordinates cannot use a texture at all, and most of
       these packs are exactly that: flat per-material colours, or vertex
       colours, and nothing to map an image onto. Deciding this BEFORE the
       materials are rebuilt is what lets the two cases keep their colour. */
    let hasUV = false, hasVertexColour = false;
    obj.traverse((n) => {
      if (!n.isMesh && !n.isSkinnedMesh) return;
      if (n.geometry?.attributes?.uv) hasUV = true;
      if (n.geometry?.attributes?.color) hasVertexColour = true;
    });

    // texture: one named for this model inside its pack, else one baked into
    // the FBX (Mixamo does that). Only worth looking for if there are UVs.
    const skin = hasUV ? findTexture(file, files, SRC) : null;
    let image = skin
      ? { data: fs.readFileSync(skin), mime: /\.png$/i.test(skin) ? "image/png" : "image/jpeg" }
      : (hasUV ? embeddedImage(fs.readFileSync(file)) : null);

    const flipped = new Set();
    obj.traverse((n) => {
      if (!n.isMesh && !n.isSkinnedMesh) return;
      const uv = n.geometry?.attributes?.uv;
      if (uv && !flipped.has(uv)) {
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
        uv.needsUpdate = true; flipped.add(uv);
      }
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      /* FBX materials are Phong, which glTF cannot express, so they are rebuilt
         as PBR. Rebuilding them as flat WHITE, which is what this did, threw
         away the only colour most of these models have: the robot and the men
         and women carry neither texture nor vertex colours, just a material
         colour each, and all of them exported as white ghosts.
         The colour is dropped only when a texture is injected over it, so the
         texture is not tinted by a factor the artist never intended. */
      const conv = mats.map((m) => {
        const s = new THREE.MeshStandardMaterial({
          color: image ? 0xffffff : (m?.color ? m.color.clone() : 0xffffff),
          vertexColors: !!m?.vertexColors,
          roughness: 0.85, metalness: 0,
        });
        /* Quaternius exports these packs with emissive set EQUAL to diffuse —
           the fish, the dragon, the hairstyles. Dropping it renders them at
           half the light the artist saw, which is why the Tang came out a
           near-black blob instead of a navy fish. glTF has emissiveFactor, so
           carry it across rather than second-guessing the source. */
        if (!image && m?.emissive && m.emissive.getHex() !== 0) s.emissive.copy(m.emissive);
        return s;
      });
      n.material = Array.isArray(n.material) ? conv : conv[0];
    });

    let out;
    try {
      out = Buffer.from(await new Promise((res, rej) =>
        exporter.parse(holder, res, rej, { binary: true, animations: clips })));
    } catch (e) { skipped.push(`${path.basename(file)}: export failed — ${e.message.slice(0, 80)}`); continue; }

    if (image) {
      try { out = injectTexture(out, image); }
      catch (e) { console.log(`  ! ${path.basename(file)}: ${e.message} — writing untextured`); }
    } else if (hasUV) {
      // UVs but nothing to map onto them is the one case that really is a
      // loss — the pack shipped no texture and the FBX carries none either.
      console.log(`  ! ${path.basename(file)}: has UVs but no texture found — flat colour only`);
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
