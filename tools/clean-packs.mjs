/**
 * Clean up asset packs uploaded as raw folders.
 *
 *   node tools/clean-packs.mjs [--apply]
 *
 * Asset packs ship every format (FBX, OBJ, Blend, textures, previews) but a
 * browser game can only use GLB. This keeps the GLBs, converts GLTF+BIN pairs
 * to GLB when a converter is available, flattens the survivors to the top of
 * their pack folder, and deletes everything else.
 *
 * Runs as a DRY RUN by default and prints what it would do; pass --apply to
 * make the changes. Deleting hundreds of files is not something to do blind.
 */
import fs from "node:fs";
import path from "node:path";

const PACKS = path.resolve("frontend/assets/models3d/packs");
const APPLY = process.argv.includes("--apply");
const MAX_MODEL_BYTES = 3 * 1024 * 1024;

// optional converter — present when node_modules has gltf-pipeline
let gltfPipeline = null;
try { gltfPipeline = (await import("gltf-pipeline")).default ?? (await import("gltf-pipeline")); } catch { /* GLTF packs get reported instead */ }

function walk(dir, hit) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, hit);
    else hit(p, st);
  }
}

if (!fs.existsSync(PACKS)) { console.log("no packs/ folder"); process.exit(0); }

const packs = fs.readdirSync(PACKS).filter((d) => fs.statSync(path.join(PACKS, d)).isDirectory());
if (!packs.length) { console.log("no pack folders yet"); process.exit(0); }

let grandKept = 0, grandBytes = 0, grandDropped = 0, grandDroppedBytes = 0;

for (const pack of packs) {
  const root = path.join(PACKS, pack);
  const glbs = [], gltfs = [], junk = [];
  walk(root, (p, st) => {
    const low = p.toLowerCase();
    if (low.endsWith(".glb")) (st.size > MAX_MODEL_BYTES ? junk : glbs).push({ p, size: st.size });
    else if (low.endsWith(".gltf")) gltfs.push({ p, size: st.size });
    else junk.push({ p, size: st.size });
  });

  // GLTF pairs are only worth converting where no GLB of the same name exists
  const glbNames = new Set(glbs.map((g) => path.basename(g.p, ".glb").toLowerCase()));
  const toConvert = gltfs.filter((g) => !glbNames.has(path.basename(g.p, ".gltf").toLowerCase()));

  const droppedBytes = junk.reduce((s, j) => s + j.size, 0);
  const keptBytes = glbs.reduce((s, g) => s + g.size, 0);
  console.log(`\n${pack}`);
  console.log(`  keep     ${String(glbs.length).padStart(4)} glb   ${(keptBytes / 1048576).toFixed(1)}MB`);
  if (toConvert.length) console.log(`  convert  ${String(toConvert.length).padStart(4)} gltf  ${gltfPipeline ? "-> glb" : "(NO CONVERTER — run from a dir with gltf-pipeline installed)"}`);
  console.log(`  delete   ${String(junk.length).padStart(4)} other ${(droppedBytes / 1048576).toFixed(1)}MB`);
  grandKept += glbs.length; grandBytes += keptBytes;
  grandDropped += junk.length; grandDroppedBytes += droppedBytes;

  if (!APPLY) continue;

  // 1. convert what we can, writing the .glb next to its .gltf
  for (const g of toConvert) {
    if (!gltfPipeline) break;
    try {
      const json = JSON.parse(fs.readFileSync(g.p, "utf8"));
      const res = await gltfPipeline.gltfToGlb(json, { resourceDirectory: path.dirname(g.p) });
      fs.writeFileSync(g.p.replace(/\.gltf$/i, ".glb"), res.glb);
      glbs.push({ p: g.p.replace(/\.gltf$/i, ".glb"), size: res.glb.length });
    } catch (e) {
      console.log(`  ! convert failed: ${path.basename(g.p)} — ${String(e.message).slice(0, 90)}`);
    }
  }

  // 2. flatten survivors to the pack root, keeping basenames unique
  const used = new Set();
  const finalPaths = [];
  for (const g of glbs) {
    let base = path.basename(g.p);
    if (used.has(base.toLowerCase())) {
      const parent = path.basename(path.dirname(g.p)).replace(/[^a-zA-Z0-9]+/g, "");
      base = path.basename(g.p, ".glb") + "_" + parent + ".glb";
    }
    used.add(base.toLowerCase());
    const dest = path.join(root, base);
    if (path.resolve(g.p) !== path.resolve(dest)) fs.copyFileSync(g.p, dest);
    finalPaths.push(dest);
  }

  // 3. remove every subdirectory (all remaining junk lives inside them)
  for (const f of fs.readdirSync(root)) {
    const p = path.join(root, f);
    if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true });
    else if (!f.toLowerCase().endsWith(".glb")) fs.unlinkSync(p);
  }
  console.log(`  ✓ ${finalPaths.length} models kept, pack flattened`);
}

console.log(`\nTOTAL keep ${grandKept} models ${(grandBytes / 1048576).toFixed(1)}MB · delete ${grandDropped} files ${(grandDroppedBytes / 1048576).toFixed(1)}MB`);
if (!APPLY) console.log("\nDRY RUN — nothing changed. Re-run with --apply to make it real.");
else console.log("\nnext: node tools/build-model-manifest.mjs");
