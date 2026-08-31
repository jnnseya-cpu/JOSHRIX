/**
 * The character ingest runs once, unattended, over files I cannot see before
 * they arrive — and everything it gets wrong produces a model that loads fine,
 * validates fine, and is broken in the game: a clip nobody can find by name, a
 * skin on the back of the head, a person 180 units tall.
 *
 * So the parts that do not need a real FBX are tested here, on synthetic input.
 * The FBX PARSE itself cannot be tested without a real file — that is the one
 * step that stays unproven until the first upload lands, and it is called out
 * rather than glossed.
 *
 *   npm i three@0.160.0
 *   node tests/t17-characters.mjs
 */
import { clipName, embeddedImage, injectTexture, slug, packGltf, repairMaterials, detachImage } from "../tools/ingest-characters.mjs";
import { resolveAsset } from "../tools/_assets.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import zlib from "node:zlib";

let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? (pass++, console.log("  PASS " + n))
                                : (fail++, console.log("  FAIL " + n + (d ? " :: " + d : ""))); };

console.log("\n== clip naming: every Mixamo clip is called 'mixamo.com' ==");
t("a bare mixamo.com name does not become the clip name",
  clipName("mixamo.com") === "idle", clipName("mixamo.com"));
t("'Slow Run (1)' -> run", clipName("Slow Run (1)") === "run", clipName("Slow Run (1)"));
t("'Walking.fbx' -> walk", clipName("Walking.fbx") === "walk", clipName("Walking.fbx"));
t("'Jumping Up' -> jump", clipName("Jumping Up") === "jump", clipName("Jumping Up"));
t("'Standing Idle' -> idle", clipName("Standing Idle") === "idle", clipName("Standing Idle"));
t("'Sword Attack' -> attack", clipName("Sword Attack") === "attack", clipName("Sword Attack"));
t("'Dying' -> die", clipName("Dying") === "die", clipName("Dying"));
t("an unknown clip keeps a usable name rather than becoming empty",
  /^[a-z0-9_]+$/.test(clipName("Crouch Sneak")), clipName("Crouch Sneak"));
t("walk is not swallowed by run", clipName("Walk") !== clipName("Run"));

console.log("\n== filenames become library-legal model names ==");
t("CamelCase splits", slug("SurvivorMaleA.fbx") === "survivor_male_a", slug("SurvivorMaleA.fbx"));
t("spaces and punctuation collapse", slug("Ch 04 nonPBR.fbx") === "ch_04_non_pbr", slug("Ch 04 nonPBR.fbx"));
t("no leading or trailing underscore", !/^_|_$/.test(slug("  weird name  .glb")));

console.log("\n== embedded image scan ==");
const png = zlib.gzipSync(Buffer.from("x"));       // arbitrary bytes to sit inside
const realPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  png,
  Buffer.from("IEND\xae\x42\x60\x82", "binary"),
]);
const fbxLike = Buffer.concat([Buffer.from("KaydaraFBXBinary  \0"), realPng, Buffer.from("trailing junk")]);
const found = embeddedImage(fbxLike);
t("finds a PNG buried in FBX bytes", !!found && found.mime === "image/png");
t("extracts the PNG exactly, with no trailing junk",
  !!found && Buffer.compare(found.data, realPng) === 0,
  found ? `got ${found.data.length} bytes, expected ${realPng.length}` : "nothing found");

const realJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), png, Buffer.from([0xff, 0xd9])]);
const jf = embeddedImage(Buffer.concat([Buffer.from("junk"), realJpg, Buffer.from("more")]));
t("finds a JPEG too", !!jf && jf.mime === "image/jpeg");
t("JPEG ends at the last EOI marker, not the first",
  !!jf && jf.data[jf.data.length - 2] === 0xff && jf.data[jf.data.length - 1] === 0xd9);
t("returns null rather than a corrupt image when there is none",
  embeddedImage(Buffer.from("no image anywhere in here at all")) === null);
t("a truncated PNG is refused instead of half-extracted",
  embeddedImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from("cut off")])) === null);

console.log("\n== GLB surgery ==");
const geo = new THREE.BoxGeometry(1, 2, 1);        // BoxGeometry ships a uv attribute
const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
const raw = Buffer.from(await new Promise((res, rej) =>
  new GLTFExporter().parse(mesh, res, rej, { binary: true })));

const out = injectTexture(raw, { data: realPng, mime: "image/png" });
t("output is still a valid GLB container", out.readUInt32LE(0) === 0x46546c67);
t("declared total length matches the real byte length", out.readUInt32LE(8) === out.length);

const jsonLen = out.readUInt32LE(12);
const doc = JSON.parse(out.toString("utf8", 20, 20 + jsonLen));
t("JSON chunk is padded to a 4-byte boundary", jsonLen % 4 === 0);
t("an image was added", (doc.images || []).length === 1 && doc.images[0].mimeType === "image/png");
t("every material points at the new texture",
  (doc.materials || []).every((m) => m.pbrMetallicRoughness?.baseColorTexture?.index === 0));
t("baseColorFactor is white so the skin is not double-darkened",
  (doc.materials || []).every((m) =>
    JSON.stringify(m.pbrMetallicRoughness.baseColorFactor) === "[1,1,1,1]"));
t("the image bufferView lies inside the buffer",
  doc.bufferViews.every((v) => v.byteOffset + v.byteLength <= doc.buffers[0].byteLength));
t("buffer length matches the BIN chunk actually written",
  doc.buffers[0].byteLength === out.readUInt32LE(20 + jsonLen));

const bin = out.subarray(20 + jsonLen + 8);
const view = doc.bufferViews[doc.images[0].bufferView];
t("the bytes at the image bufferView are the PNG we put there",
  Buffer.compare(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength), realPng) === 0);

console.log("\n== it refuses to ship an invisible texture ==");
const noUv = new THREE.Mesh(new THREE.BufferGeometry().setAttribute(
  "position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3)),
  new THREE.MeshStandardMaterial());
const rawNoUv = Buffer.from(await new Promise((res, rej) =>
  new GLTFExporter().parse(noUv, res, rej, { binary: true })));
let threw = false;
try { injectTexture(rawNoUv, { data: realPng, mime: "image/png" }); } catch { threw = true; }
t("a mesh with no UVs throws rather than shipping a blank skin", threw);


console.log("\n== .gltf + .bin + loose texture packs into one .glb ==");
{
  // Round-trip a REAL library model: split a shipped .glb into the .gltf/.bin/.png
  // layout a bought pack arrives in, pack it back, and check nothing moved.
  const src = path.join(process.env.JOSHRIX_ROOT || ".", "frontend/assets/models3d/packs/kenney-characters/zombie_a.glb");
  const glb = fs.readFileSync(src);
  const jsonLen = glb.readUInt32LE(12);
  const doc = JSON.parse(glb.toString("utf8", 20, 20 + jsonLen));
  const bin = glb.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + glb.readUInt32LE(20 + jsonLen));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gltf-"));
  fs.writeFileSync(path.join(dir, "model.bin"), bin);
  const ext = JSON.parse(JSON.stringify(doc));
  ext.buffers = [{ uri: "model.bin", byteLength: bin.length }];
  // move any embedded image out to a loose file, the way a real pack ships it
  let loose = 0;
  for (const img of ext.images || []) {
    if (img.bufferView === undefined) continue;
    const v = ext.bufferViews[img.bufferView];
    fs.writeFileSync(path.join(dir, `tex${loose}.png`), bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
    img.uri = `tex${loose}.png`; delete img.bufferView; delete img.mimeType; loose++;
  }
  fs.writeFileSync(path.join(dir, "model.gltf"), JSON.stringify(ext));

  const packed = packGltf(path.join(dir, "model.gltf"));
  const pl = packed.readUInt32LE(12);
  const pd = JSON.parse(packed.toString("utf8", 20, 20 + pl));

  t("packs to a valid GLB", packed.readUInt32LE(0) === 0x46546c67);
  t("declared length matches real length", packed.readUInt32LE(8) === packed.length);
  t("collapses to exactly one buffer", pd.buffers.length === 1);
  t("no bufferView still points at another buffer", pd.bufferViews.every((v) => (v.buffer || 0) === 0));
  t("every bufferView stays inside the buffer",
    pd.bufferViews.every((v) => (v.byteOffset || 0) + v.byteLength <= pd.buffers[0].byteLength));
  t("no image is left referencing a file — a GLB may not",
    (pd.images || []).every((i) => !i.uri && i.bufferView !== undefined));
  t(`all ${loose} loose texture(s) came back in`, (pd.images || []).length === (doc.images || []).length);
  t("mesh count is unchanged", (pd.meshes || []).length === (doc.meshes || []).length);
  t("accessor count is unchanged", (pd.accessors || []).length === (doc.accessors || []).length);
  t("the skin (rig) survived", JSON.stringify(pd.skins || []) === JSON.stringify(doc.skins || []));
  t("animation clips survived",
    (pd.animations || []).length === (doc.animations || []).length);

  // the real proof: an accessor's bytes must be identical, not merely present
  const a = doc.accessors.find((x) => x.bufferView !== undefined);
  if (a) {
    const ov = doc.bufferViews[a.bufferView], nv = pd.bufferViews[a.bufferView];
    const pbin = packed.subarray(20 + pl + 8);
    t("vertex bytes are byte-identical after packing",
      Buffer.compare(bin.subarray(ov.byteOffset || 0, (ov.byteOffset || 0) + ov.byteLength),
                     pbin.subarray(nv.byteOffset || 0, (nv.byteOffset || 0) + nv.byteLength)) === 0);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

/* The Nov 2019 Quaternius export writes Skin as near-black in 48 of 52 files.
 * The repair has to be narrow: plenty of materials in the same packs are meant
 * to be nearly black (Black, Visor, Eye_Black, Hair), and brightening those
 * would be a worse bug than the one being fixed. So it matches the exact broken
 * constant, and these assertions are what keep it that narrow. */
console.log("\n== the black-skin repair, and everything it must NOT touch ==");
const BROKEN = 0.013410447165369987;
const SKIN = [0.6172067523002625, 0.4178851246833801, 0.23839758336544037];
const mat = (name, c) => ({ name, pbrMetallicRoughness: { baseColorFactor: c } });

{
  const doc = { materials: [mat("Skin", [BROKEN, BROKEN, BROKEN, 1])] };
  t("the broken Skin constant is repaired", repairMaterials(doc) === 1);
  t("repaired to the artist's own skin tone from their 2022 packs",
    doc.materials[0].pbrMetallicRoughness.baseColorFactor.slice(0, 3)
      .every((v, i) => Math.abs(v - SKIN[i]) < 1e-12));
  t("alpha is preserved", doc.materials[0].pbrMetallicRoughness.baseColorFactor[3] === 1);
}
{
  // the goblins and zombies: a Skin material that is dark but not THE constant
  const doc = { materials: [mat("Skin", [0.042, 0.077, 0.035, 1])] };
  t("a Skin that is merely dark is left alone", repairMaterials(doc) === 0);
  t("...and its colour is untouched",
    doc.materials[0].pbrMetallicRoughness.baseColorFactor[1] === 0.077);
}
{
  const doc = {
    materials: [mat("Black", [BROKEN, BROKEN, BROKEN, 1]), mat("Eye_Black", [BROKEN, BROKEN, BROKEN, 1]),
                mat("Visor", [BROKEN, BROKEN, BROKEN, 1]), mat("Hair", [BROKEN, BROKEN, BROKEN, 1])],
  };
  t("materials that are SUPPOSED to be black are never brightened", repairMaterials(doc) === 0);
}
{
  const doc = { materials: [mat("Skin", [BROKEN, BROKEN, 0.5, 1])] };
  t("a partial match is not a match", repairMaterials(doc) === 0);
}
t("a document with no materials does not throw", repairMaterials({}) === 0);

// and the library itself: no character may ship with a black face again
{
  const packs = path.resolve("frontend/assets/models3d/packs");
  let dark = 0, checked = 0;
  if (fs.existsSync(packs)) {
    for (const p of fs.readdirSync(packs)) {
      const d = path.join(packs, p);
      if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".glb"))) {
        const b = fs.readFileSync(path.join(d, f));
        if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) continue;
        let o = 12, j = null;
        while (o + 8 <= b.length) {
          const len = b.readUInt32LE(o), ty = b.readUInt32LE(o + 4);
          if (ty === 0x4e4f534a) { try { j = JSON.parse(b.subarray(o + 8, o + 8 + len).toString("utf8")); } catch {} }
          o += 8 + ((len + 3) & ~3);
        }
        const m = (j?.materials || []).find((x) => /^skin$/i.test(x.name || ""));
        const c = m?.pbrMetallicRoughness?.baseColorFactor;
        if (!c) continue;
        checked++;
        if (c.slice(0, 3).every((v) => Math.abs(v - BROKEN) < 1e-9)) dark++;
      }
    }
  }
  t(`no shipped model carries the broken Skin constant (${checked} checked)`, dark === 0, dark + " still black");
}

/* ------------------------------------------------------------------ *
 * A REFERENCED FILE THAT IS NOT WHERE THE glTF SAYS IT IS
 *
 * Universal Base Characters shipped with its .gltf asking for
 * "T_Eye_Normal_png.png" while the pack contains "T_Eye_Normal.png" — the
 * exporter appended _png to some names and not others. That is 18 characters
 * whose eye and hair normals silently 404 at play time, on a pack that has
 * been in the repository since 22 Aug and looked complete.
 * ------------------------------------------------------------------ */
console.log("\n== a texture the exporter misnamed is still found ==");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-"));
  fs.mkdirSync(path.join(dir, "Textures"), { recursive: true });
  const real = path.join(dir, "Textures", "T_Eye_Normal.png");
  fs.writeFileSync(real, Buffer.from("not-really-a-png"));

  t("the exact path wins when it exists",
    resolveAsset(dir, "Textures/T_Eye_Normal.png") === real);
  t("the exporter's spurious _png suffix is stripped",
    resolveAsset(dir, "Textures/T_Eye_Normal_png.png") === real);
  t("a texture moved to another folder is still found by name",
    resolveAsset(dir, "T_Eye_Normal_png.png", [real]) === real);
  t("case is not allowed to lose a file on a case-sensitive filesystem",
    resolveAsset(dir, "t_eye_NORMAL.png", [real]) === real);
  // Leniency must have a floor: inventing a match would ship the wrong picture.
  t("a file that genuinely is not there resolves to null",
    resolveAsset(dir, "Textures/T_Nothing.png", [real]) === null);
  t("a different texture is never substituted",
    resolveAsset(dir, "Textures/T_Hair_1_Normal.png", [real]) === null);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("\n== an unreadable texture is detached, not left dangling ==");
{
  // Leaving the uri in place exports a GLB that fetches a file which is not
  // inside it — a 404 for every character built from the pack.
  const doc = {
    images: [{ uri: "gone.png" }, { uri: "here.png" }],
    textures: [{ source: 0 }, { source: 1 }],
    materials: [{
      name: "Body",
      pbrMetallicRoughness: { baseColorTexture: { index: 1 }, metallicRoughnessTexture: { index: 0 } },
      normalTexture: { index: 0 },
      emissiveTexture: { index: 1 },
    }],
  };
  detachImage(doc, 0);
  const m = doc.materials[0];
  t("the missing normal map slot is removed", m.normalTexture === undefined);
  t("the missing roughness slot is removed", m.pbrMetallicRoughness.metallicRoughnessTexture === undefined);
  t("the texture that IS present is untouched", m.pbrMetallicRoughness.baseColorTexture?.index === 1);
  t("...and so is every other slot using it", m.emissiveTexture?.index === 1);
  // Deleting from images[] would repoint every texture after it at the wrong
  // picture, which is worse than the missing map it was trying to fix.
  t("indices are never renumbered", doc.images.length === 2 && doc.textures[1].source === 1);
  t("detaching an image nothing uses does nothing", (detachImage(doc, 7), doc.materials[0].emissiveTexture?.index === 1));
  t("a document with no materials does not throw",
    (detachImage({ images: [{ uri: "x" }], textures: [{ source: 0 }] }, 0), true));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
console.log("  NOT COVERED: parsing a real FBX. That needs a real file and stays");
console.log("  unproven until the first pack is uploaded.");
process.exit(fail ? 1 : 0);
