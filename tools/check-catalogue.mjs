/**
 * Verify every model name in the forge's 3D catalogue actually exists on disk.
 *
 *   node tools/check-catalogue.mjs
 *
 * The catalogue in api/_gateway.ts is hand-written prose. A single typo there
 * sends the Code Agent to a 404 for every game that reaches for that model,
 * and nothing in the build or the tests would notice. This is the guard.
 *
 * Exits non-zero on any name that does not resolve to a real .glb.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync("api/_gateway.ts", "utf8");
const MODELS = path.resolve("frontend/assets/models3d");

// The catalogue runs from the LIBRARY 1 header to the USAGE RULES header.
const start = SRC.indexOf("LIBRARY 1 — JOSHRIX house models");
const end = SRC.indexOf("USAGE RULES:", start);
if (start < 0 || end < 0) {
  console.error("Could not locate the catalogue block in api/_gateway.ts");
  process.exit(1);
}
const block = SRC.slice(start, end);

/** Which directory a given catalogue line's names live in. */
function dirForLine(line, current) {
  const kit = line.match(/^-\s+(kenney-[a-z0-9-]+)\s+\(/);
  if (kit) return path.join(MODELS, "packs", kit[1]);
  if (/LIBRARY 2 —|models3d\/vehicles\//.test(line)) return path.join(MODELS, "vehicles");
  if (/LIBRARY 1 —|models3d\/lib\//.test(line)) return path.join(MODELS, "lib");
  if (/LIBRARY 3 —/.test(line)) return null;          // header only, names follow per kit
  return current;
}

/** Words that are prose, not filenames. */
const STOP = new Set([
  "and", "or", "the", "a", "an", "also", "as", "each", "with", "every", "one",
  "to", "for", "use", "sold", "separately", "wheels", "build", "stack", "base",
  "style", "pieces", "are", "variant", "anim", "all", "tall", "higher", "detail",
  "models", "emissive", "collectables", "stylised", "spin", "walk", "idle",
  "bounce", "fly", "from", "these", "kits", "in", "by", "on", "of", "repeated",
  "straight", "curve", "track",
]);

let current = null;
const missing = [];
let checked = 0;

for (const rawLine of block.split("\n")) {
  const line = rawLine.trim();
  if (!line) continue;
  current = dirForLine(line, current);
  if (!current) continue;
  if (!line.startsWith("-")) continue;               // only the bullet lines carry names
  // Kits whose files are numbered (roadtile_001 …) are described in prose, not a
  // name list — scanning that prose would report every English word as missing.
  if (/\)\s+NUMBERED:/.test(line)) continue;

  // strip the leading "- CATEGORY:" or "- kenney-x (n)" label, then parenthetical asides
  let body = line.replace(/^-\s+[A-Za-z0-9/\- ]+?(\([^)]*\))?\s*:\s*/, "")
                 .replace(/^-\s+kenney-[a-z0-9-]+\s+\(\d+\)\s+[^:]*:\s*/, "");
  if (body === line) body = line.replace(/^-\s+/, "");
  body = body.replace(/\([^)]*\)/g, " ").replace(/·/g, " ");

  for (const tok of body.split(/[\s,]+/)) {
    const name = tok.replace(/[^A-Za-z0-9_.-]/g, "");
    if (!name || STOP.has(name.toLowerCase())) continue;
    if (!/^[a-z][a-z0-9_]*$/.test(name)) continue;   // filenames are lower_snake
    checked++;
    if (!fs.existsSync(path.join(current, name + ".glb"))) {
      missing.push(`${path.basename(current)}/${name}.glb`);
    }
  }
}

console.log(`checked ${checked} catalogue names`);
if (missing.length) {
  console.log(`\nMISSING (${missing.length}):`);
  for (const m of missing) console.log("  " + m);
  process.exit(1);
}
console.log("every catalogue name resolves to a real model");
