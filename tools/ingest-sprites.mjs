/**
 * Ingest Kenney's CC0 2D sprite packs into frontend/assets/sprites/.
 *
 *   node tools/ingest-sprites.mjs <path-to-kenney-mirror-clone>
 *
 * The 2D forge draws everything procedurally today, which is why its games look
 * generic next to the 3D ones. These packs give it real art to reach for, using
 * the same shape of contract as the 3D library: individual files with
 * descriptive names, so the Code Agent only has to know a filename — no
 * spritesheet coordinates to guess at, which it cannot see and would get wrong.
 *
 * Nothing is downloaded here: point this at a clone you already have.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.argv[2] || "");
const DEST = path.resolve("frontend/assets/sprites");

if (!SRC || !fs.existsSync(SRC)) {
  console.error("Usage: node tools/ingest-sprites.mjs <path-to-kenney-mirror-clone>");
  process.exit(1);
}

/** [source subtree(s), published pack name, kit label for the licence file]
 *  The icon pack ships every icon four times — White/Black at 1x/2x — which
 *  produces hundreds of name clashes and a catalogue where the Code Agent
 *  cannot tell the variants apart. We take White at 2x only: one entry per
 *  icon, high enough resolution to scale down, and white reads correctly on
 *  the dark JOSHRIX palette. */
const PACKS = [
  ["platformer-art-complete-pack-0/Base pack", "kenney-platformer", "Platformer Art Complete Pack"],
  ["topdown-shooter/PNG", "kenney-topdown", "Topdown Shooter"],
  ["kenneyDungeonPack_2.3/Characters", "kenney-dungeon", "Dungeon Pack"],
  ["kenney_rpgurbanpack", "kenney-rpg-urban", "RPG Urban Pack"],
  [["gameicons-expansion/Game icons (base)/PNG/White/2x", "gameicons-expansion/PNG/White/2x"],
   "kenney-icons", "Game Icons + Expansion"],
  ["puzzle-pack-ii", "kenney-puzzle", "Puzzle Pack II"],
];

/** URL-safe, stable, lower_snake — the same convention as the 3D library. */
const clean = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
   .replace(/[^A-Za-z0-9_.-]+/g, "_")
   .replace(/_+/g, "_")
   .replace(/^_|_$/g, "")
   .toLowerCase();

/** PNG magic — a Thumbs.db or a stray text file renamed .png would ship broken. */
function isPng(buf) {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

/** These decode perfectly and are still wrong to publish as sprites: a packed
 *  spritesheet drawn as one image renders a grid of every frame at once, and
 *  preview/sample files are the pack's marketing art, not game assets. */
const NOT_A_SPRITE = /(^|[_-])(spritesheet|sheet)([_-]|$)|^preview|^sample/i;

fs.mkdirSync(DEST, { recursive: true });
let grandTotal = 0, grandBytes = 0;

for (const [subs, pack, kit] of PACKS) {
  const roots = (Array.isArray(subs) ? subs : [subs])
    .map((s) => path.join(SRC, s))
    .filter((r) => fs.existsSync(r));
  if (!roots.length) { console.log(`skip ${pack} — source not found`); continue; }

  const out = path.join(DEST, pack);
  fs.mkdirSync(out, { recursive: true });

  // walk the whole subtree; these packs nest by category (Tiles/, Enemy sprites/ …)
  const files = [];
  for (const root of roots) {
    (function walk(dir, rel) {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p, path.posix.join(rel, f));
        else if (f.toLowerCase().endsWith(".png")) files.push({ abs: p, rel, base: path.basename(f, path.extname(f)) });
      }
    })(root, "");
  }

  // Flatten to basenames, disambiguating with the category folder. Two different
  // source names can still normalise to the same string (Tile_01 and tile-01 both
  // become tile_01), so every written name is claimed in a set and suffixed if
  // taken — otherwise sprites quietly overwrite each other and the count looks
  // right while the art is missing.
  const collides = new Map();
  for (const f of files) collides.set(f.base, (collides.get(f.base) ?? 0) + 1);

  const claimed = new Set();
  const claim = (want) => {
    let name = want || "sprite";
    if (!claimed.has(name)) { claimed.add(name); return name; }
    for (let i = 2; ; i++) {
      const alt = `${name}_${i}`;
      if (!claimed.has(alt)) { claimed.add(alt); return alt; }
    }
  };

  let n = 0, bytes = 0, skipped = 0, renamed = 0;
  for (const f of files) {
    if (NOT_A_SPRITE.test(f.base)) { skipped++; continue; }
    const buf = fs.readFileSync(f.abs);
    if (!isPng(buf)) { skipped++; continue; }
    const want = collides.get(f.base) > 1 && f.rel
      ? clean(f.rel.split("/").pop() + "_" + f.base)
      : clean(f.base);
    const name = claim(want);
    if (name !== want) renamed++;
    fs.writeFileSync(path.join(out, name + ".png"), buf);
    n++; bytes += buf.length;
  }

  fs.writeFileSync(path.join(out, "LICENSE.txt"), [
    `${pack} — from Kenney's "${kit}".`,
    "",
    "Licence: CC0 1.0 Universal (public domain dedication).",
    "Free for personal, educational and commercial use. Attribution is not",
    "required, but is appreciated: https://kenney.nl",
    "",
    "Source: https://kenney.nl/assets  ·  mirror: https://github.com/ETdoFresh/kenney.nl",
    "",
  ].join("\n"));

  console.log(`${pack.padEnd(22)} ${String(n).padStart(4)} sprites  ${(bytes / 1048576).toFixed(1)}MB` +
    (skipped ? `  ${skipped} skipped (spritesheet/preview/non-PNG)` : "") +
    (renamed ? `  ${renamed} suffixed to avoid a name clash` : ""));
  grandTotal += n; grandBytes += bytes;
}

console.log(`${"TOTAL".padEnd(22)} ${String(grandTotal).padStart(4)} sprites  ${(grandBytes / 1048576).toFixed(1)}MB`);
