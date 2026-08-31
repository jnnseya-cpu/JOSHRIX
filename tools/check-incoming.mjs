/**
 * check-incoming — say out loud what git is about to keep, and what it is
 * about to throw away.
 *
 * Written after a silent loss: 28 character packs were copied into
 * _incoming/characters/ and 8 of them never appeared in the repository at all,
 * because every file they contained matched the folder's .gitignore and git
 * has no way to record a folder with no surviving files. There was no error to
 * read and nothing in `git status` to notice — the packs simply were not there,
 * and it took nine days to find out.
 *
 * The .gitignore rules are correct and stay. What was missing is anyone saying
 * so. This asks git itself — `git check-ignore`, the same code path that does
 * the discarding — and prints one line per pack folder.
 *
 *   node tools/check-incoming.mjs           all drop folders
 *   node tools/check-incoming.mjs characters-fbx    just one
 *
 * Exit code is 1 if any pack would land with no loadable model, so this can
 * gate a commit rather than merely inform one.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveAsset } from "./_assets.mjs";

const ROOT = path.resolve("frontend/assets/models3d/_incoming");
const SPRITES = path.resolve("frontend/assets/sprites/_incoming");

/* what each pipeline can actually load — a folder holding none of these is a
   folder holding no game content, whatever its file count says */
const MODEL = /\.(glb|gltf|fbx|obj)$/i;
const SPRITE = /\.(png|jpe?g|svg)$/i;
const TEXTURE = /\.(png|jpe?g|bin|mtl)$/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name === ".git") continue;
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/* Ask git, in one call, which of these paths it would discard. Batching matters:
   a pack can hold 4,000 files and one process per file takes minutes. */
function ignoredSet(files) {
  if (!files.length) return new Set();
  const ignored = new Set();
  const BATCH = 2000;                       // stays well inside the argv limit
  for (let i = 0; i < files.length; i += BATCH) {
    const chunk = files.slice(i, i + BATCH);
    try {
      // exit 0 = some paths ignored, 1 = none ignored; both are success here,
      // so read stdout off the thrown error rather than treating 1 as failure
      const out = execFileSync("git", ["check-ignore", "--stdin"],
        { input: chunk.join("\n"), encoding: "utf8" });
      out.split("\n").filter(Boolean).forEach((l) => ignored.add(path.resolve(l)));
    } catch (e) {
      if (e.status === 1) continue;         // nothing in this batch is ignored
      throw new Error(`git check-ignore failed: ${String(e.stderr || e.message).slice(0, 200)}`);
    }
  }
  return ignored;
}

/* A .gltf names its geometry and its textures by filename, and a missing one
   fails at very different severities. A missing .bin means no mesh at all —
   the model does not exist. A missing texture means the ingest strips that one
   material slot and the character still plays, slightly plainer.
   Quaternius also ships .gltf with the buffer embedded and no images at all
   (flat vertex-coloured materials); that is complete and must not be flagged.

   Resolution goes through the same resolveAsset() the ingest uses, so this
   never reports a file the ingest would go on to find. */
function missingRefs(gltfPath, kept, index) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(gltfPath, "utf8")); }
  catch { return { fatal: [path.basename(gltfPath) + " is not valid glTF JSON"], cosmetic: [] }; }
  const dir = path.dirname(gltfPath);
  const check = (list) => (list ?? [])
    .map((x) => x.uri).filter((u) => u && !u.startsWith("data:"))
    .filter((u) => {
      const at = resolveAsset(dir, u, index);
      return !at || !kept.has(path.resolve(at));
    })
    .map((u) => path.basename(u));
  return { fatal: check(doc.buffers), cosmetic: check(doc.images) };
}

const human = (n) => n > 1e9 ? (n / 1e9).toFixed(2) + " GB"
  : n > 1e6 ? Math.round(n / 1e6) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";

/** Pack folders are the leaves worth reporting on: a drop folder's immediate
 *  children, except that a whole bundle ("Characters and Animals") is itself a
 *  folder of packs, so descend one level when a child holds only directories. */
function packFolders(base) {
  const out = [];
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(base, e.name);
    const kids = fs.readdirSync(p, { withFileTypes: true });
    const allDirs = kids.length > 0 && kids.every((k) => k.isDirectory());
    if (allDirs) out.push(...kids.map((k) => path.join(p, k.name)));
    else out.push(p);
  }
  return out.sort();
}

const only = process.argv[2];
const drops = [
  ...(fs.existsSync(ROOT) ? fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => path.join(ROOT, e.name)) : []),
  ...(fs.existsSync(SPRITES) ? [SPRITES] : []),
].filter((d) => !only || path.basename(d) === only);

if (!drops.length) {
  console.error(only ? `no drop folder called "${only}"` : `nothing at ${ROOT}`);
  process.exit(1);
}

let lost = 0, kept = 0, dropped = 0, kbytes = 0;

for (const drop of drops) {
  const label = path.relative(process.cwd(), drop);
  const packs = packFolders(drop);
  console.log(`\n${label}${packs.length ? "" : "   (empty)"}`);

  for (const pack of packs) {
    const files = walk(pack);
    if (!files.length) { console.log(`  ${"(empty folder)".padEnd(46)}  —`); continue; }
    const ign = ignoredSet(files);
    const keep = files.filter((f) => !ign.has(path.resolve(f)));
    const bytes = keep.reduce((n, f) => n + fs.statSync(f).size, 0);

    const isSprite = drop === SPRITES;
    const models = keep.filter((f) => (isSprite ? SPRITE : MODEL).test(f)).length;
    const keptSet = new Set(keep.map((f) => path.resolve(f)));
    const fatal = new Set(), cosmetic = new Set();
    for (const g of keep.filter((f) => /\.gltf$/i.test(f))) {
      const r = missingRefs(g, keptSet, keep);
      r.fatal.forEach((m) => fatal.add(m));
      r.cosmetic.forEach((m) => cosmetic.add(m));
    }

    kept += keep.length; dropped += files.length - keep.length; kbytes += bytes;

    // a folder whose only survivor is a Preview.png is the exact failure this
    // tool exists to name — it looks uploaded and contains nothing
    const some = (s) => [...s].slice(0, 2).join(", ") + (s.size > 2 ? `, +${s.size - 2}` : "");
    let verdict;
    if (models === 0) { verdict = "LOST — nothing loadable survives"; lost++; }
    else if (fatal.size) { verdict = `${models} models, but geometry is missing (${some(fatal)})`; lost++; }
    else if (cosmetic.size) { verdict = `${models} models, playable; ${cosmetic.size} texture${cosmetic.size === 1 ? "" : "s"} absent (${some(cosmetic)})`; }
    else verdict = `${models} model${models === 1 ? "" : "s"}, complete`;

    console.log(`  ${path.basename(pack).slice(0, 46).padEnd(46)}  ${String(keep.length).padStart(5)} kept ${String(files.length - keep.length).padStart(6)} dropped ${human(bytes).padStart(8)}  ${verdict}`);
  }
}

console.log(`\n${kept} files kept (${human(kbytes)}), ${dropped} dropped by .gitignore`);
if (lost) {
  console.log(`\n${lost} pack${lost === 1 ? "" : "s"} would land unplayable.`);
  console.log(`A pack that ships FBX only belongs in`);
  console.log(`frontend/assets/models3d/_incoming/characters-fbx/, which keeps every format.`);
}
process.exit(lost ? 1 : 0);
