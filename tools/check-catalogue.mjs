/**
 * Verify every asset name in the forge's catalogues actually exists on disk —
 * both the 3D model catalogue and the 2D sprite catalogue.
 *
 *   node tools/check-catalogue.mjs
 *
 * The catalogues in api/_gateway.ts are hand-written prose. A single typo there
 * sends the Code Agent to a 404 for every game that reaches for that asset, and
 * nothing in the build or the tests would notice. This is the guard.
 *
 * Exits non-zero on any name that does not resolve to a real file.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync("api/_gateway.ts", "utf8");
const MODELS = path.resolve("frontend/assets/models3d");
const SPRITES = path.resolve("frontend/assets/sprites");

/** Words that appear in the prose around the name lists, not filenames. */
const STOP = new Set([
  "and", "or", "the", "a", "an", "also", "as", "each", "with", "every", "one",
  "to", "for", "use", "sold", "separately", "wheels", "build", "stack", "base",
  "style", "pieces", "are", "variant", "anim", "all", "tall", "higher", "detail",
  "models", "emissive", "collectables", "stylised", "spin", "walk", "idle",
  "bounce", "fly", "from", "these", "kits", "in", "by", "on", "of", "repeated",
  "straight", "curve", "track",
  // 2D catalogue prose
  "players", "enemies", "pickups", "hazards", "world", "hud", "poses", "same",
  "come", "six", "biomes", "grass", "dirt", "sand", "snow", "stone", "castle",
  "suffixes", "frame", "cycle", "nine", "characters", "plus", "ground", "tiles",
  "named", "descriptive", "names", "where", "any", "floor", "tile", "will", "do",
  "not", "specific", "room", "real", "animation", "cycles", "through", "spelling",
  "zombie", "exactly", "crisp", "white", "icons", "menus", "best", "dark", "is",
  "valid", "frames", "backgrounds", "paddle", "pipe", "particle", "when", "you",
  "need", "piece", "good", "scattering", "urban", "modern", "city", "rpg",
]);

const blocks = [];

/* ---- 3D: from the LIBRARY 1 header to USAGE RULES ---- */
{
  const start = SRC.indexOf("LIBRARY 1 — JOSHRIX house models");
  const end = SRC.indexOf("USAGE RULES:", start);
  if (start < 0 || end < 0) { console.error("could not locate the 3D catalogue"); process.exit(1); }
  blocks.push({
    label: "3D models", ext: ".glb", text: SRC.slice(start, end),
    dirFor(line, current) {
      const kit = line.match(/^-\s+(kenney-[a-z0-9-]+)\s+\(/);
      if (kit) return path.join(MODELS, "packs", kit[1]);
      if (/LIBRARY 2 —|models3d\/vehicles\//.test(line)) return path.join(MODELS, "vehicles");
      if (/LIBRARY 1 —|models3d\/lib\//.test(line)) return path.join(MODELS, "lib");
      if (/LIBRARY 3 —/.test(line)) return null;      // header only, names follow per kit
      return current;
    },
  });
}

/* ---- 2D: from the SPRITE LIBRARY header to the end of its last kit line ---- */
{
  const start = SRC.indexOf("JOSHRIX SPRITE LIBRARY");
  if (start < 0) { console.error("could not locate the 2D sprite catalogue"); process.exit(1); }
  const end = SRC.indexOf("POLISH BAR", start);
  blocks.push({
    label: "2D sprites", ext: ".png", text: SRC.slice(start, end > 0 ? end : undefined),
    // Unlike the 3D block, every 2D name list lives on its own pack line, so a
    // bullet that is not a pack line carries no names. Returning null instead of
    // `current` stops the scan leaking into the prose that follows the catalogue.
    dirFor(line) {
      const pack = line.match(/^-\s+(kenney-[a-z0-9-]+)\s+\(/);
      return pack ? path.join(SPRITES, pack[1]) : null;
    },
  });
}

let checked = 0;
const missing = [];

for (const block of blocks) {
  let current = null;
  for (const rawLine of block.text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    current = block.dirFor(line, current);
    if (!current) continue;
    if (!line.startsWith("-")) continue;             // only the bullet lines carry names
    // Packs whose files are numbered (roadtile_001 …, tile_0000 …) are described
    // in prose, not a name list — scanning that prose reports every English word.
    if (/\)\s+NUMBERED:/.test(line)) continue;

    // strip the leading "- CATEGORY:" or "- kenney-x (n)" label, then asides
    let body = line.replace(/^-\s+[A-Za-z0-9/\- ]+?(\([^)]*\))?\s*:\s*/, "")
                   .replace(/^-\s+kenney-[a-z0-9-]+\s+\(\d+\)\s+[^:]*:\s*/, "");
    if (body === line) body = line.replace(/^-\s+/, "");
    // drop any inline code sample — a snippet like `new THREE.Mesh…` is not names
    const brace = body.indexOf("{");
    if (brace >= 0) body = body.slice(0, brace);
    body = body.replace(/\([^)]*\)/g, " ").replace(/·/g, " ");

    for (const tok of body.split(/[\s,]+/)) {
      const name = tok.replace(/[^A-Za-z0-9_.-]/g, "");
      if (!name || STOP.has(name.toLowerCase())) continue;
      // a token ending in "_" is a family prefix (p2_, zoimbie1_), not a filename
      if (name.endsWith("_")) continue;
      if (!/^[a-z][a-z0-9_]*$/.test(name)) continue; // filenames are lower_snake
      checked++;
      if (!fs.existsSync(path.join(current, name + block.ext))) {
        missing.push(`[${block.label}] ${path.basename(current)}/${name}${block.ext}`);
      }
    }
  }
}

console.log(`checked ${checked} catalogue names`);
if (missing.length) {
  console.log(`\nMISSING (${missing.length}):`);
  for (const m of missing) console.log("  " + m);
  process.exit(1);
}
console.log("every catalogue name resolves to a real asset");
