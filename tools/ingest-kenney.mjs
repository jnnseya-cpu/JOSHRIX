/**
 * Ingest the Kenney CC0 GLB kits into frontend/assets/models3d/packs/.
 *
 *   node tools/ingest-kenney.mjs <path-to-kenney-mirror-clone>
 *
 * The mirror (github.com/ETdoFresh/kenney.nl) ships every kit as
 * <kit>/Models/GLTF format/<name>.glb. We flatten that to
 * packs/kenney-<kit>/<name>.glb so the manifest builder — which walks
 * packs/<pack>/ — picks them up with no special cases.
 *
 * Nothing is downloaded here: point this at a clone you already have, so the
 * step is repeatable offline and reviewable before anything lands in the repo.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.argv[2] || "");
const DEST = path.resolve("frontend/assets/models3d/packs");

if (!SRC || !fs.existsSync(SRC)) {
  console.error("Usage: node tools/ingest-kenney.mjs <path-to-kenney-mirror-clone>");
  process.exit(1);
}

/** Kit folder name -> the pack name we publish it under. Version suffixes and
 *  inconsistent casing in the mirror would otherwise leak into public URLs. */
function packNameFor(kitDir) {
  const slug = kitDir
    .replace(/^kenney[_-]?/i, "")
    .replace(/[_-]?(v?\d+(\.\d+)*|updated)$/i, "")
    .replace(/[_\s]+/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return "kenney-" + (slug || "kit");
}

/** GLB basenames are already descriptive; just make them URL-safe and stable. */
function fileNameFor(base) {
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .toLowerCase();
}

const kits = fs
  .readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("."))
  .map((d) => d.name)
  .filter((d) => fs.existsSync(path.join(SRC, d, "Models", "GLTF format")));

if (!kits.length) {
  console.error("No <kit>/Models/GLTF format folders found under " + SRC);
  process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });
let totalFiles = 0, totalBytes = 0;
const rows = [];

for (const kit of kits) {
  const from = path.join(SRC, kit, "Models", "GLTF format");
  const pack = packNameFor(kit);
  const to = path.join(DEST, pack);
  fs.mkdirSync(to, { recursive: true });

  let n = 0, bytes = 0;
  for (const f of fs.readdirSync(from)) {
    if (!f.toLowerCase().endsWith(".glb")) continue;
    const out = fileNameFor(f);
    const buf = fs.readFileSync(path.join(from, f));
    // GLB magic is "glTF" — refuse anything that is not actually a binary glTF
    if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "glTF") {
      console.warn(`  skipped ${kit}/${f} — not a binary glTF`);
      continue;
    }
    fs.writeFileSync(path.join(to, out), buf);
    n++; bytes += buf.length;
  }

  // CC0 still asks for the source to travel with the files
  fs.writeFileSync(
    path.join(to, "LICENSE.txt"),
    [
      `${pack} — from Kenney's "${kit}" kit.`,
      "",
      "Licence: CC0 1.0 Universal (public domain dedication).",
      "Free for personal, educational and commercial use. Attribution is not",
      "required, but is appreciated: https://kenney.nl",
      "",
      "Source: https://kenney.nl/assets  ·  mirror: https://github.com/ETdoFresh/kenney.nl",
      "",
    ].join("\n"),
  );

  rows.push({ pack, n, bytes });
  totalFiles += n; totalBytes += bytes;
}

rows.sort((a, b) => b.n - a.n);
for (const r of rows) {
  console.log(`${r.pack.padEnd(28)} ${String(r.n).padStart(4)} models  ${(r.bytes / 1048576).toFixed(1)}MB`);
}
console.log(`${"TOTAL".padEnd(28)} ${String(totalFiles).padStart(4)} models  ${(totalBytes / 1048576).toFixed(1)}MB`);
