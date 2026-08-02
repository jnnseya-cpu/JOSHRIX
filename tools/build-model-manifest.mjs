/**
 * Rebuild frontend/assets/models3d/manifest.json from whatever is on disk.
 *
 * Run after uploading asset packs:  node tools/build-model-manifest.mjs
 *
 * Scans every packs/<pack-name>/ folder for .glb files, derives theme tags from
 * each filename, and writes one manifest the Code Agent's catalogue is built
 * from. Hand-curated packs (wonder/) keep their richer entries — this only
 * regenerates the scanned packs, so nothing authored by hand is overwritten.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || "frontend/assets/models3d");
const PACKS = path.join(ROOT, "packs");
const MANIFEST = path.join(ROOT, "manifest.json");

/** filename keyword -> tags. Kenney/Quaternius/KayKit all name files descriptively. */
const TAGWORDS = [
  [/tree|pine|palm|oak|birch|willow/i, ["tree", "nature"]],
  [/bush|shrub|plant|flower|grass|fern|crop/i, ["foliage", "nature"]],
  [/rock|stone|boulder|cliff|mountain/i, ["rock", "nature"]],
  [/mushroom|fungus/i, ["mushroom", "nature", "fantasy"]],
  [/log|stump|branch|trunk/i, ["wood", "nature"]],
  [/house|building|hut|cottage|shop|inn|tavern|barn/i, ["building", "structure"]],
  [/tower|castle|keep|turret|wall|gate|fort/i, ["castle", "structure", "fantasy"]],
  [/ruin|pillar|column|arch|statue|obelisk/i, ["ruin", "structure", "fantasy"]],
  [/bridge|fence|road|path|stairs|ladder/i, ["prop", "structure"]],
  [/chest|barrel|crate|box|sack|bag|pot|vase/i, ["container", "prop"]],
  [/torch|lantern|lamp|candle|fire|campfire|brazier/i, ["light", "prop", "emissive"]],
  [/sword|axe|bow|shield|staff|dagger|hammer|spear|weapon/i, ["weapon", "prop"]],
  [/coin|gem|crystal|treasure|key|potion|scroll|book/i, ["collectable", "prop"]],
  [/skeleton|zombie|orc|goblin|demon|dragon|slime|spider|monster|enemy/i, ["enemy", "character", "creature"]],
  [/knight|mage|rogue|warrior|barbarian|ranger|druid|character|hero|player|human|adventurer/i, ["character", "humanoid"]],
  [/cow|sheep|horse|dog|cat|bird|fish|deer|bear|wolf|fox|animal/i, ["animal", "creature"]],
  [/car|truck|van|bus|bike|boat|ship|plane|rocket|vehicle|tank/i, ["vehicle"]],
  [/space|planet|asteroid|satellite|astronaut|alien|ufo/i, ["space", "scifi"]],
  [/dungeon|tomb|crypt|coffin|grave|skull|bone/i, ["dungeon", "dark"]],
  [/snow|ice|desert|sand|cactus|lava|swamp/i, ["biome", "nature"]],
];

/** Packs whose license differs from the repo default — stated per pack, never guessed. */
const KNOWN_LICENSES = {
  "kenney-nature": "CC0 1.0 — Kenney (kenney.nl)",
  "kenney-castle": "CC0 1.0 — Kenney (kenney.nl)",
  "kenney-survival": "CC0 1.0 — Kenney (kenney.nl)",
  "kenney-city": "CC0 1.0 — Kenney (kenney.nl)",
  "kenney-space": "CC0 1.0 — Kenney (kenney.nl)",
  "kenney-cars": "CC0 1.0 — Kenney (kenney.nl)",
  "kenney-fantasy-town": "CC0 1.0 — Kenney (kenney.nl)",
  "quaternius-characters": "CC0 1.0 — Quaternius (quaternius.com)",
  "quaternius-nature": "CC0 1.0 — Quaternius (quaternius.com)",
  "kaykit-dungeon": "CC0 1.0 — Kay Lousberg (kaylousberg.itch.io)",
  "kaykit-characters": "CC0 1.0 — Kay Lousberg (kaylousberg.itch.io)",
};

function tagsFor(file) {
  const base = path.basename(file, ".glb");
  const tags = new Set();
  for (const [re, ts] of TAGWORDS) if (re.test(base)) ts.forEach((t) => tags.add(t));
  if (!tags.size) tags.add("prop");
  return [...tags];
}

function scanPacks() {
  if (!fs.existsSync(PACKS)) return {};
  const out = {};
  for (const dir of fs.readdirSync(PACKS)) {
    const full = path.join(PACKS, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    const files = [];
    // one level of nesting tolerated — packs often ship Models/ subfolders
    const walk = (d, rel) => {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) walk(p, path.posix.join(rel, f));
        else if (f.toLowerCase().endsWith(".glb")) files.push(path.posix.join(rel, f));
      }
    };
    walk(full, "");
    if (!files.length) continue;
    out[dir] = {
      license: KNOWN_LICENSES[dir] || "CC0 (verify at source before publishing)",
      models: files.sort().map((f) => ({
        file: path.posix.join("packs", dir, f),
        tags: tagsFor(f),
        bytes: fs.statSync(path.join(full, f)).size,
      })),
    };
  }
  return out;
}

const existing = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { packs: {} };
const scanned = scanPacks();
const manifest = {
  base: existing.base || "https://www.joshrix.com/assets/models3d/",
  loader: existing.loader || "https://www.joshrix.com/assets/vendor/GLTFLoader.js",
  packs: { ...(existing.packs?.wonder ? { wonder: existing.packs.wonder } : {}), ...scanned },
};
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

let total = 0, bytes = 0;
for (const [name, p] of Object.entries(manifest.packs)) {
  const n = p.models.length;
  const b = p.models.reduce((s, m) => s + (m.bytes || 0), 0);
  total += n; bytes += b;
  console.log(`${name.padEnd(24)} ${String(n).padStart(4)} models  ${(b / 1048576).toFixed(1)}MB`);
}
console.log(`${"TOTAL".padEnd(24)} ${String(total).padStart(4)} models  ${(bytes / 1048576).toFixed(1)}MB`);
