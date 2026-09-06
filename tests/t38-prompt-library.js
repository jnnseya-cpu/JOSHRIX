/**
 * THE FORGE MUST BE ABLE TO SEE EVERY MODEL THE PLATFORM SHIPS.
 *
 * `packs/quaternius-fbx` — 156 models, 103 of them animated: the only sea life,
 * the only dinosaurs, and the only fishing and dock props in the library —
 * was ingested on 31 Aug, written into manifest.json, deployed, and counted in
 * the "2,591 models included" the landing page advertises.
 *
 * The build prompt never named it. The Code Agent can only write a model path it
 * has been given, so those 156 models could not appear in any forged game: paid
 * for, shipped, invisible. Nothing failed. No test went red. The library count
 * stayed true, because the models really were there — just not reachable by the
 * one thing that builds games.
 *
 * That is the same shape as the eight character packs that vanished into
 * .gitignore in August: an asset pipeline that succeeds silently while the thing
 * downstream of it never learns the asset exists. `tools/check-incoming.mjs`
 * closed the upload end. This closes the consumption end.
 *
 * It also guards the two numbers in the prompt's own headers, which had drifted
 * before anyone noticed: LIBRARY 4 claimed "152 rigged models in 9 packs, 150
 * animated" when the manifest held 162 in 10 packs with 156 animated — wrong on
 * all three counts, and wrong in the direction that undersells the library to
 * the model actually writing the game.
 *
 *   node tests/t38-prompt-library.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROMPT = fs.readFileSync(path.join(ROOT, 'api/_gateway.ts'), 'utf8');
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'frontend/assets/models3d/manifest.json'), 'utf8'));
const PACK_DIR = path.join(ROOT, 'frontend/assets/models3d/packs');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { c ? (pass++, console.log('  PASS ' + n))
                                : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : ''))); };

const modelsOf = (p) => (Array.isArray(p) ? p : p.models) || [];
const packs = MANIFEST.packs || {};

/* ================================================================= *
 * 1. EVERY PACK ON DISK IS NAMED IN THE PROMPT
 * ================================================================= */
console.log('\nevery shipped pack is reachable by the Code Agent');
{
  const onDisk = fs.readdirSync(PACK_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  t('there are packs on disk to check', onDisk.length > 0);

  for (const pack of onDisk) {
    const count = fs.readdirSync(path.join(PACK_DIR, pack))
      .filter((f) => /\.glb$/i.test(f)).length;
    if (!count) continue;                    // an empty directory advertises nothing
    t(`${pack} (${count} models) is named in the build prompt`,
      PROMPT.includes(pack),
      'ingested and deployed but the forge cannot write a path to it — add it to LIBRARY 3 or 4');
  }
}

/* ================================================================= *
 * 2. EVERY MODEL NAME THE PROMPT LISTS ACTUALLY EXISTS
 * -----------------------------------------------------------------
 * The reverse failure, and the more damaging one: a name the prompt invents is
 * a path that 404s at play time, so the creator gets a world with holes in it
 * and no error anywhere to explain why.
 * ================================================================= */
console.log('\nevery model name the prompt lists resolves to a file');
{
  /* Pack lines look like:  - pack-name (123) description: name_a name_b · name_c
     Only the segment after the first colon is a name list; the description
     before it is prose and must not be treated as filenames. */
  const lines = PROMPT.split('\n').filter((l) => /^- [a-z0-9-]+ \(\d+/.test(l));
  t('the catalogue lines were found', lines.length > 20, `found ${lines.length}`);

  /* Pack names appear INSIDE other packs' prose — kenney-road-kit's entry sends
     you to kenney-racingkit for a track you can reason about. Those are
     cross-references, not filenames, and a checker that reports them is the
     report that stops being read. */
  const packNames = new Set(fs.readdirSync(PACK_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name));

  let checked = 0;
  const unknown = [];
  for (const line of lines) {
    const pack = line.match(/^- ([a-z0-9-]+)/)[1];
    const dir = path.join(PACK_DIR, pack);
    if (!fs.existsSync(dir)) continue;              // sprite packs live elsewhere
    const files = new Set(fs.readdirSync(dir)
      .filter((f) => /\.glb$/i.test(f))
      .map((f) => f.replace(/\.glb$/i, '')));

    const colon = line.indexOf(':');
    if (colon === -1) continue;                     // numbered pack, no name list
    for (const tok of line.slice(colon + 1).replace(/\([^)]*\)/g, ' ').split(/[\s·]+/)) {
      const name = tok.trim().replace(/[.,]$/, '');
      /* Only judge tokens that look like a filename from this pack. Prose words
         sit in the same sentence, and a checker that flags "and" reports 79
         failures nobody reads — the design-audit lesson, applied here. */
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name) || name.length < 2) continue;
      if (packNames.has(name)) continue;                         // a cross-reference
      if (files.has(name)) { checked++; continue; }              // known good, done
      /* Below here the token is NOT a file in this pack, so decide whether it is
         a name the prompt got wrong or an English word that happens to sit in
         the sentence. Hyphens settle it: no pack on disk uses one in a filename,
         so "road_straight-style" is prose describing a naming pattern. */
      if (name.includes('-')) continue;
      if (!/[_0-9]/.test(name)) continue;                        // bare English word
      checked++;
      unknown.push(`${pack}/${name}`);
    }
  }
  t(`${checked} model names checked against disk`, checked > 400, `only ${checked}`);
  t('none of them is unknown to the pack it is listed under',
    unknown.length === 0, unknown.slice(0, 12).join(' '));
}

/* ================================================================= *
 * 3. THE HEADLINE COUNTS IN THE PROMPT MATCH THE MANIFEST
 * ================================================================= */
console.log('\nthe prompt states the library it actually has');
{
  let qPacks = 0, qModels = 0, qAnimated = 0;
  let kModels = 0, kKits = 0;
  for (const [name, p] of Object.entries(packs)) {
    const mods = modelsOf(p);
    const animated = mods.filter((m) => (m.clips || []).length).length;
    if (name.startsWith('quaternius')) { qPacks++; qModels += mods.length; qAnimated += animated; }
    if (name.startsWith('kenney')) { kKits++; kModels += mods.length; }
  }

  const lib4 = PROMPT.match(/LIBRARY 4 — QUATERNIUS[^\n]*?(\d+) models in (\d+) packs, (\d+) of them/);
  t('LIBRARY 4 declares its size', !!lib4);
  if (lib4) {
    t(`LIBRARY 4 model count is ${qModels}`, +lib4[1] === qModels, `prompt says ${lib4[1]}`);
    t(`LIBRARY 4 pack count is ${qPacks}`, +lib4[2] === qPacks, `prompt says ${lib4[2]}`);
    t(`LIBRARY 4 animated count is ${qAnimated}`, +lib4[3] === qAnimated, `prompt says ${lib4[3]}`);
  }

  const lib3 = PROMPT.match(/LIBRARY 3 — KENNEY CC0 KITS, ([\d,]+) models in (\d+) themed kits/);
  t('LIBRARY 3 declares its size', !!lib3);
  if (lib3) {
    t(`LIBRARY 3 model count is ${kModels}`, +lib3[1].replace(/,/g, '') === kModels, `prompt says ${lib3[1]}`);
    t(`LIBRARY 3 kit count is ${kKits}`, +lib3[2] === kKits, `prompt says ${lib3[2]}`);
  }
}

/* ================================================================= *
 * 4. THE TWO QUIRKS OF quaternius-fbx ARE STATED
 * -----------------------------------------------------------------
 * This pack breaks both conventions the prompt teaches everywhere else, and a
 * build that follows the general rule gets a frozen character or an avocado the
 * size of a horse. Silence here is worse than omitting the pack.
 * ================================================================= */
console.log('\nthe quaternius-fbx exceptions are spelled out');
{
  const entry = PROMPT.slice(PROMPT.indexOf('- quaternius-fbx'));
  const block = entry.slice(0, entry.indexOf('\nEVERY LIBRARY 4 MODEL') + 1 || 4000);

  t('the pack is in the prompt at all', PROMPT.includes('- quaternius-fbx ('));
  t('the lowercase clip convention is called out',
    /lowercase/i.test(block) && /"idle"/.test(block),
    'every other Quaternius pack uses "Idle" — following that here freezes the character');
  t('the 1.85-unit normalisation is called out',
    /1\.85 units tall/.test(block) && /height/i.test(block),
    'without this an avocado loads the same size as a horse');

  /* And prove the two claims are TRUE of the shipped files, not just asserted —
     a warning about a quirk that no longer exists is its own kind of lie. */
  const fbx = modelsOf(packs['quaternius-fbx'] || {});
  t('the shipped pack really does use lowercase clips',
    fbx.every((m) => (m.clips || []).every((c) => c === c.toLowerCase())));
  const heights = fbx.map((m) => m.height).filter(Boolean);
  const normalised = heights.filter((h) => Math.abs(h - 1.85) < 0.15).length;
  t('the shipped pack really is normalised to ~1.85 units',
    normalised / heights.length > 0.9,
    `${normalised}/${heights.length} within 0.15 of 1.85`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
