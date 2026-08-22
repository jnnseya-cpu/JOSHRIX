/**
 * Convert Kenney's animated-character FBX packs to textured, animated GLB.
 *
 *   node --import ./tools/gltf-export-polyfill.mjs \
 *        tools/fbx-characters-to-glb.mjs <mirror-dir> <out-dir>
 *
 * Each pack is one rigged mesh (Model/characterMedium.fbx), three animations in
 * separate files (Animations/{idle,run,jump}.fbx), and several interchangeable
 * skin textures (Skins/*.png). One mesh + N skins = N distinct characters, which
 * is why this is worth the effort: rigged humanoids are the scarcest thing in the
 * whole library.
 *
 * Three things this has to get right, each of which silently ruins the model:
 *
 * 1. Every animation FBX contains TWO clips — the real one, and a two-keyframe
 *    "Targeting Pose". Their order is not consistent between files, so taking
 *    animations[0] gives you a 0.04-second clip for some animations and the real
 *    thing for others. We take the LONGEST clip in each file.
 * 2. FBX is authored in centimetres. Imported raw the character stands ~376
 *    units tall, against a library where a person is ~2. We normalise height.
 * 3. GLTFExporter cannot embed a texture under Node (it reaches for a canvas),
 *    so the skin is injected into the finished GLB by hand — appended to the
 *    binary chunk with the image/sampler/texture/material wiring to match.
 */
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "node:fs";
import path from "node:path";

const MIRROR = path.resolve(process.argv[2] || ".");
const OUT = path.resolve(process.argv[3] || "out");
const TARGET_HEIGHT = 1.85;          // metres — matches lib/ where a person is ~2 units

const PACKS = [
  { dir: "animated-characters-1", prefix: "" },
  { dir: "animated-characters-2", prefix: "" },
];

const loader = new FBXLoader();
const exporter = new GLTFExporter();

/** The real clip is the longest one; the short one is the "Targeting Pose" junk. */
function pickClip(clips) {
  return clips.slice().sort((a, b) => b.duration - a.duration)[0] ?? null;
}

/* ---------- GLB surgery: append a PNG and point every material at it ---------- */

const pad4 = (n) => (n + 3) & ~3;

function injectTexture(glbBuffer, pngBuffer) {
  const dv = new DataView(glbBuffer.buffer, glbBuffer.byteOffset, glbBuffer.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");

  // chunk 0 is JSON, chunk 1 is BIN
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(glbBuffer.toString("utf8", 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  const binLen = dv.getUint32(20 + jsonLen, true);
  const bin = glbBuffer.subarray(binStart, binStart + binLen);

  // a texture is useless without UVs — fail loudly rather than ship a blank skin
  const hasUv = (json.meshes || []).some((m) =>
    (m.primitives || []).some((p) => p.attributes && p.attributes.TEXCOORD_0 !== undefined));
  if (!hasUv) throw new Error("mesh has no TEXCOORD_0 — texture would not show");

  const offset = pad4(bin.length);
  const padded = Buffer.alloc(offset - bin.length);
  const newBin = Buffer.concat([bin, padded, pngBuffer, Buffer.alloc(pad4(pngBuffer.length) - pngBuffer.length)]);

  json.bufferViews = json.bufferViews || [];
  json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: pngBuffer.length });
  const viewIndex = json.bufferViews.length - 1;

  json.images = json.images || [];
  json.images.push({ bufferView: viewIndex, mimeType: "image/png" });
  const imageIndex = json.images.length - 1;

  json.samplers = json.samplers || [];
  json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
  const samplerIndex = json.samplers.length - 1;

  json.textures = json.textures || [];
  json.textures.push({ sampler: samplerIndex, source: imageIndex });
  const textureIndex = json.textures.length - 1;

  for (const mat of json.materials || []) {
    mat.pbrMetallicRoughness = mat.pbrMetallicRoughness || {};
    mat.pbrMetallicRoughness.baseColorTexture = { index: textureIndex, texCoord: 0 };
    // the skin carries all the colour; a tinted base would double-darken it
    mat.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
    mat.pbrMetallicRoughness.metallicFactor = 0;
    mat.pbrMetallicRoughness.roughnessFactor = 0.85;
  }

  json.buffers = [{ byteLength: newBin.length }];

  const newJson = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = Buffer.alloc(pad4(newJson.length) - newJson.length, 0x20);
  const jsonChunk = Buffer.concat([newJson, jsonPad]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + newBin.length, 8);

  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonChunk.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);            // 'JSON'

  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(newBin.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);             // 'BIN'

  return Buffer.concat([header, jsonHead, jsonChunk, binHead, newBin]);
}

/* ---------------------------------- run ---------------------------------- */

fs.mkdirSync(OUT, { recursive: true });
const made = [];

for (const pack of PACKS) {
  const root = path.join(MIRROR, pack.dir);
  if (!fs.existsSync(root)) { console.log(`skip ${pack.dir} — not found`); continue; }

  const clips = [];
  for (const name of ["idle", "run", "jump"]) {
    const f = path.join(root, "Animations", `${name}.fbx`);
    if (!fs.existsSync(f)) continue;
    const c = pickClip(loader.parse(fs.readFileSync(f).buffer, "").animations);
    if (!c) continue;
    c.name = name;
    clips.push(c);
  }

  const skins = fs.existsSync(path.join(root, "Skins"))
    ? fs.readdirSync(path.join(root, "Skins")).filter((f) => f.toLowerCase().endsWith(".png"))
    : [];

  for (const skin of skins) {
    // reload per skin: the exporter mutates the graph, and clips bind to bones
    const model = loader.parse(fs.readFileSync(path.join(root, "Model", "characterMedium.fbx")).buffer, "");

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;

    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar(scale);
    holder.updateMatrixWorld(true);

    // give every material a plain standard material the exporter is happy with,
    // and flip V: FBX UVs assume a bottom-left origin, glTF assumes top-left, so
    // without this the face lands on the back of the head and the shirt scrambles
    const flipped = new Set();
    model.traverse((n) => {
      if (!n.isMesh && !n.isSkinnedMesh) return;
      const uv = n.geometry && n.geometry.attributes.uv;
      if (uv && !flipped.has(uv)) {
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
        uv.needsUpdate = true;
        flipped.add(uv);
      }
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      const conv = mats.map(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }));
      n.material = Array.isArray(n.material) ? conv : conv[0];
    });

    const raw = Buffer.from(await new Promise((res, rej) =>
      exporter.parse(holder, res, rej, { binary: true, animations: clips })));

    const png = fs.readFileSync(path.join(root, "Skins", skin));
    let out;
    try {
      out = injectTexture(raw, png);
    } catch (e) {
      console.log(`  ! ${skin}: ${e.message} — writing untextured`);
      out = raw;
    }

    const name = path.basename(skin, ".png").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase() + ".glb";
    fs.writeFileSync(path.join(OUT, name), out);
    made.push({ name, bytes: out.length, clips: clips.map((c) => c.name), scale: +scale.toFixed(4) });
  }
}

for (const m of made) {
  console.log(`${m.name.padEnd(26)} ${(m.bytes / 1024).toFixed(0).padStart(5)}KB  clips=${m.clips.join(",")}  scale=${m.scale}`);
}
console.log(`\n${made.length} characters written to ${OUT}`);
