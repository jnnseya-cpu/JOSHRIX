/**
 * Ingest uploaded asset-pack zips.
 *
 *   node tools/ingest-packs.mjs
 *
 * Reads every .zip in frontend/assets/models3d/_incoming/, extracts it to a
 * temp dir, collects every .glb inside (at any depth), flattens them into
 * frontend/assets/models3d/packs/<zip-name>/, then deletes the zip and the
 * temp files so no archive is left in the repo.
 *
 * Reports .gltf/.bin-only packs rather than guessing: those need a conversion
 * pass, and a silently skipped pack looks like a successful ingest.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve("frontend/assets/models3d");
const INCOMING = path.join(ROOT, "_incoming");
const PACKS = path.join(ROOT, "packs");

/** Model files a browser game can load directly, cheapest-first. */
const MAX_MODEL_BYTES = 3 * 1024 * 1024;   // a single 3MB+ model is a loading-time bug in a web game

function walk(dir, hit) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, hit);
    else hit(p, st);
  }
}

/** pack folder name from a zip filename: "Nature Kit v2.zip" -> "nature-kit-v2" */
function packName(zip) {
  return path.basename(zip, ".zip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

if (!fs.existsSync(INCOMING)) {
  console.log("no _incoming/ folder — nothing to ingest");
  process.exit(0);
}
const zips = fs.readdirSync(INCOMING).filter((f) => f.toLowerCase().endsWith(".zip"));
if (!zips.length) {
  console.log("no zips in _incoming/ — nothing to ingest");
  process.exit(0);
}

fs.mkdirSync(PACKS, { recursive: true });
const summary = [];

for (const zip of zips) {
  const zipPath = path.join(INCOMING, zip);
  const name = packName(zip);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jxpack-"));
  try {
    execFileSync("unzip", ["-qq", "-o", zipPath, "-d", tmp], { stdio: "pipe" });
  } catch (e) {
    summary.push({ name, error: "could not unzip: " + String(e.message).slice(0, 120) });
    fs.rmSync(tmp, { recursive: true, force: true });
    continue;
  }

  const glbs = [];
  let gltfCount = 0, skippedBig = 0;
  walk(tmp, (p, st) => {
    const low = p.toLowerCase();
    if (low.endsWith(".glb")) {
      if (st.size > MAX_MODEL_BYTES) { skippedBig++; return; }
      glbs.push(p);
    } else if (low.endsWith(".gltf")) gltfCount++;
  });

  if (glbs.length) {
    const dest = path.join(PACKS, name);
    fs.mkdirSync(dest, { recursive: true });
    let bytes = 0;
    const used = new Set();
    for (const src of glbs) {
      // flatten: keep basenames unique when two subfolders hold the same name
      let base = path.basename(src);
      if (used.has(base.toLowerCase())) {
        const parent = path.basename(path.dirname(src)).replace(/[^a-zA-Z0-9]+/g, "");
        base = path.basename(src, ".glb") + "_" + parent + ".glb";
      }
      used.add(base.toLowerCase());
      fs.copyFileSync(src, path.join(dest, base));
      bytes += fs.statSync(src).size;
    }
    summary.push({ name, models: glbs.length, mb: (bytes / 1048576).toFixed(1), skippedBig, gltfCount });
    fs.unlinkSync(zipPath);                       // archive consumed — never committed
  } else {
    summary.push({ name, models: 0, gltfCount, note: gltfCount ? "GLTF-only (needs conversion) — zip kept" : "no models found — zip kept" });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("");
for (const s of summary) {
  if (s.error) { console.log(`✗ ${s.name}: ${s.error}`); continue; }
  if (!s.models) { console.log(`⚠ ${s.name}: ${s.note}${s.gltfCount ? ` (${s.gltfCount} .gltf files)` : ""}`); continue; }
  console.log(`✓ ${s.name}: ${s.models} models, ${s.mb}MB` +
    (s.skippedBig ? ` (${s.skippedBig} oversized skipped)` : "") +
    (s.gltfCount ? ` (${s.gltfCount} .gltf ignored — GLB preferred)` : ""));
}
console.log("\nnext: node tools/build-model-manifest.mjs");
