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
import { clipName, embeddedImage, injectTexture, slug } from "../tools/ingest-characters.mjs";
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

console.log(`\n  ${pass} passed, ${fail} failed`);
console.log("  NOT COVERED: parsing a real FBX. That needs a real file and stays");
console.log("  unproven until the first pack is uploaded.");
process.exit(fail ? 1 : 0);
