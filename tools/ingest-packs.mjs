/**
 * Ingest static asset packs — props, buildings, scenery, vehicles.
 *
 *   npm i three@0.160.0
 *   node --import ./tools/gltf-export-polyfill.mjs tools/ingest-packs.mjs
 *
 * Two inputs, because two things upload packs:
 *
 *   FOLDERS in _incoming/packs/   — what UPLOADING-ASSETS.md tells a person to
 *                                   do, and what arrives from a drive or the
 *                                   GitHub web uploader. One folder, one pack.
 *   ZIPS in _incoming/            — the original path, kept working. The archive
 *                                   is consumed so it is never committed.
 *
 * IT READS .gltf AS WELL AS .glb, and that is the whole point of this revision.
 * Until 2 Oct 2026 it collected only `.glb` and reported anything else as
 * "GLTF-only (needs conversion)". Quaternius — the supplier this repository
 * actually buys from — ships `.gltf` with a sibling `.bin` and loose textures,
 * so a Quaternius static upload would have landed ZERO models and said so in a
 * line that reads like a status rather than a failure. Several gigabytes would
 * have gone into git history for nothing.
 *
 * glTF is packed to a single self-contained .glb by packGltf(), the same
 * function tools/ingest-characters.mjs uses, so there is one implementation of
 * that surgery rather than two that drift.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { packGltf, nameClaimer } from "./ingest-characters.mjs";

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

/** Every model file in a tree, plus the full file list so packGltf can resolve
 *  a .gltf's sibling .bin and its loose textures. */
function collect(root) {
  const glbs = [], gltfs = [], all = [];
  let skippedBig = 0;
  walk(root, (p, st) => {
    all.push(p);
    const low = p.toLowerCase();
    if (low.endsWith(".glb")) {
      /* A single 3MB+ model is a loading-time bug in a browser game. Counted,
         never silently dropped — the summary prints it. */
      if (st.size > MAX_MODEL_BYTES) { skippedBig++; return; }
      glbs.push(p);
    } else if (low.endsWith(".gltf")) gltfs.push(p);
  });
  return { glbs, gltfs, all, skippedBig };
}

/**
 * Write one pack. GLB is copied through untouched; glTF is packed to a
 * self-contained GLB with its buffer and textures inlined.
 *
 * Names come from the shared claimer, so two subfolders holding `Tree.gltf`
 * produce `tree.glb` and `nature_tree.glb` instead of one file and a silent
 * loss. That is the bug that cost Ultimate Monsters ten of its fifty models,
 * and static kits are organised exactly the same way.
 */
const FINISH_RANK = [[/textured/i, 0], [/flat[\s_-]*shaded/i, 1], [/flat[\s_-]*colors?/i, 2]];
/** Which finish a path sits under, best first. Unmarked paths rank between
 *  Textured and the flat variants: a pack with no finish folders is just models. */
function finishRank(p) {
  for (const [re, n] of FINISH_RANK) if (re.test(p)) return n;
  return 0.5;
}
/** The folders that actually say WHICH MODEL this is, with format and finish
 *  folders removed. Two files whose category path is identical are the same
 *  model in two finishes, not two models. */
function categoryPath(root, f) {
  return path.relative(root, f).split(path.sep).slice(0, -1)
    .filter((d) => !NOT_A_CATEGORY_RE.test(d)).join("/").toLowerCase();
}
const NOT_A_CATEGORY_RE = /^(gltf|glb|fbx|obj|exports?|textured|flat[\s_-]*colors?|flat[\s_-]*shaded|source|files?|godot|unreal|unity|standard)/i;

/**
 * ONE FINISH PER MODEL. Quaternius ships most kits three times over — Textured,
 * Flat Shaded, Flat Colors — and a naive ingest writes all three as tree.glb,
 * tree_2.glb and tree_3.glb. That is the same tree at triple the bytes, in a
 * repository whose own runbook opens by warning that anything pushed to git
 * stays in git forever.
 *
 * So candidates are grouped by what identifies the model — its name plus its
 * CATEGORY folders, with format and finish folders stripped — and the
 * best-ranked finish wins. Textured first, because it carries the maps; a kit
 * with no finish folders at all is unaffected.
 *
 * This is a deduplication, not a loss: the skipped files are the same geometry
 * with a different material, and the count is reported so it is visible.
 */
function pickOneFinish(sources, root) {
  const best = new Map();
  for (const f of sources) {
    const key = slugKey(f) + "|" + categoryPath(root, f);
    const cur = best.get(key);
    if (!cur || finishRank(f) < finishRank(cur)) best.set(key, f);
  }
  const kept = new Set(best.values());
  return { kept: sources.filter((f) => kept.has(f)), dropped: sources.length - kept.size };
}
const slugKey = (f) => path.basename(f).replace(/\.[^.]+$/, "").toLowerCase();

function writePack(name, root, { glbs, gltfs, all }) {
  if (!glbs.length && !gltfs.length) {
    return { models: 0, note: "no .glb or .gltf found — nothing ingested, source kept" };
  }
  const dest = path.join(PACKS, name);
  fs.mkdirSync(dest, { recursive: true });
  const outName = nameClaimer(root);
  let bytes = 0, models = 0, packed = 0;
  const failed = [];

  /* GLB is lossless and runs first, so a pack shipping both formats of one
     model keeps the GLB and the glTF is skipped as the duplicate. */
  const glbPick = pickOneFinish(glbs, root);
  const gltfPick = pickOneFinish(gltfs, root);
  let dupFinish = glbPick.dropped + gltfPick.dropped;

  for (const src of glbPick.kept) {
    const out = path.join(dest, outName(src));
    fs.copyFileSync(src, out);
    bytes += fs.statSync(out).size;
    models++;
  }
  for (const src of gltfPick.kept) {
    const target = path.join(dest, outName(src));
    if (fs.existsSync(target) && glbPick.kept.length) { dupFinish++; continue; }
    try {
      const buf = packGltf(src, all);
      fs.writeFileSync(target, buf);
      bytes += buf.length;
      models++; packed++;
    } catch (e) {
      failed.push(`${path.basename(src)}: ${String(e.message).slice(0, 70)}`);
    }
  }
  const r = { models, packed, dupFinish, mb: (bytes / 1048576).toFixed(1) };
  if (failed.length) r.failed = failed;
  return r;
}

/** pack folder name from a zip filename: "Nature Kit v2.zip" -> "nature-kit-v2" */
function packName(zip) {
  return path.basename(zip, ".zip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* Exported so tests can exercise the parts that decide what is KEPT — the
   finish preference and the category grouping — without an ingest. Same shape
   as tools/ingest-characters.mjs, including the invoked-directly guard: without
   it, importing this file runs an ingest and calls process.exit. */
export { collect, writePack, pickOneFinish, categoryPath, finishRank, packName };

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  if (!fs.existsSync(INCOMING)) {
    console.log("no _incoming/ folder — nothing to ingest");
    process.exit(0);
  }

  const zips = fs.readdirSync(INCOMING).filter((f) => f.toLowerCase().endsWith(".zip"));

  /* FOLDERS in _incoming/packs/ — the route UPLOADING-ASSETS.md documents, and
     until now the one this tool could not read. One folder is one pack, and its
     folder name becomes the pack name, so `Nature Kit` lands as `nature-kit`. */
  const FOLDER_IN = path.join(INCOMING, "packs");
  const folders = fs.existsSync(FOLDER_IN)
    ? fs.readdirSync(FOLDER_IN, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(FOLDER_IN, e.name))
    : [];

  if (!zips.length && !folders.length) {
    console.log(`nothing to ingest — no folders in ${path.relative(process.cwd(), FOLDER_IN)}/ and no zips in _incoming/`);
    process.exit(0);
  }

  fs.mkdirSync(PACKS, { recursive: true });
  const summary = [];

  /* Folders first: nothing to extract and nothing to delete afterwards. */
  for (const dir of folders) {
    const name = packName(path.basename(dir) + ".zip");   // same slug rule as a zip
    const { glbs, gltfs, all, skippedBig } = collect(dir);
    const written = writePack(name, dir, { glbs, gltfs, all });
    summary.push({ name, ...written, skippedBig, gltfCount: gltfs.length, from: "folder" });
  }

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

    const { glbs, gltfs, all, skippedBig } = collect(tmp);
    const gltfCount = gltfs.length;

    const written = writePack(name, tmp, { glbs, gltfs, all });
    summary.push({ name, ...written, skippedBig, gltfCount });
    if (written.models > 0) fs.unlinkSync(zipPath);   // archive consumed — never committed
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("");
  for (const s of summary) {
    if (s.error) { console.log(`✗ ${s.name}: ${s.error}`); continue; }
    if (!s.models) { console.log(`⚠ ${s.name}: ${s.note}${s.gltfCount ? ` (${s.gltfCount} .gltf files)` : ""}`); continue; }
    const notes = [];
    if (s.packed) notes.push(`${s.packed} packed from glTF`);
    if (s.dupFinish) notes.push(`${s.dupFinish} duplicate finishes skipped`);
    if (s.skippedBig) notes.push(`${s.skippedBig} over ${MAX_MODEL_BYTES / 1048576}MB skipped`);
    if (s.failed) notes.push(`${s.failed.length} FAILED`);
    console.log(`✓ ${s.name}: ${s.models} models, ${s.mb}MB` +
      (notes.length ? `  (${notes.join("; ")})` : ""));
    for (const f of s.failed || []) console.log(`    ! ${f}`);
  }
  console.log("\nnext: node tools/build-model-manifest.mjs");

}
