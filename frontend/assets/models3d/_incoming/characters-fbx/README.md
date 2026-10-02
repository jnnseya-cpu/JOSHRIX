# The character upload is finished — all 28 packs are in

Every pack of `All in One - Quaternius[Patreon] / Characters and Animals` is now
in the repository and ingested into the live library. **Nothing needs copying
here any more.** This file used to be a to-do list of 18 missing packs; it is
kept as a record of what the folder is for, and as the place to drop the next
character pack you buy.

Current state, measured rather than remembered — `node tools/check-incoming.mjs`
reprints it any time:

| | |
|---|---|
| Packs staged in this folder | 19, all complete, 0 files dropped |
| Ingested into `packs/quaternius-fbx` | 156 models |
| Models in the whole library | 2,601 across 35 packs |
| Of those, carrying skeletal animation | 291 |

## What was wrong, and what closed it

**22 Aug.** All 28 packs were copied into `../characters/`, whose `.gitignore`
keeps only glTF and textures. 10 arrived complete, 10 arrived as nothing but a
stray `Preview.png`, and 8 never reached the repository at all — every file in
them matched the ignore rule, and git cannot record a folder with no surviving
files, so they vanished with no error and nothing in `git status` to notice. That
took nine days to find, because nothing was checking.

**Closed by** this folder, which keeps every format — glTF, FBX and textures
alike — so you never have to work out what a pack ships; and by
`tools/check-incoming.mjs`, which prints one line per pack saying what git will
actually keep and exits non-zero if a pack would land unplayable.

**2 Oct.** A second, quieter loss was found at the other end of the pipe.
`Ultimate Monsters` ships 50 creatures split across `Big/`, `Blob/` and
`Flying/`, and ten names appear in two of those folders — a Big Alien and a Blob
Alien are different creatures, not variants. The ingest named its output from the
filename alone, so both wrote `alien.glb` and the second overwrote the first. The
pack had been live for weeks holding 40 of its 50 models, with no error and a
count that looked plausible.

**Closed by** collision-safe naming in `tools/ingest-characters.mjs`: the first
claimant keeps the plain name and later ones are qualified by the folder that
distinguishes them, so the ten arrived as `blob_alien`, `flying_demon` and so on.
`tests/t17` now counts distinct names against files on disk, so a pack cannot
lose a model to a name clash again without a test saying so.

## Three packs hold fewer models than they ship, on purpose

Do not "fix" these — the gap is the ingest making the right call, and each was
checked individually on 2 Oct.

| Pack | Ships | In the library | Why |
|---|---|---|---|
| Animated Mech Pack | 8 | 4 | Four mechs in two finishes, Textured and Flat Colors. One finish is the model; the other is the same mech again. |
| Modular Character Outfits — Fantasy | 24 | 4 | Four complete outfits plus twenty separate arms, legs, bodies and boots. A pair of boots is not a character, and the runtime has no modular assembly. |
| Universal Base Characters | 18 | 2 | Two full bodies plus eight hairstyles and eyebrows, each shipped twice for two rigging modes. A standalone wig loaded as a character is a floating wig. |

## Dropping the next pack you buy

Copy the folder straight in here — any format, textures and all — then:

```bash
node tools/check-incoming.mjs          # what git will keep, per pack
git add . && git status                # READ THIS before committing
git commit -m "Add <pack name>" && git push
```

Then ingest it into the live library and republish the counts:

```bash
npm i three@0.160.0
node --import ./tools/gltf-export-polyfill.mjs \
     tools/ingest-characters.mjs "<path to the pack>" <pack-name>
node tools/build-model-manifest.mjs    # must run BEFORE validate
node tools/validate-models.mjs --write # --write, or the measured data is lost
node tools/run-tests.mjs               # names every surface quoting a count
```

The order of those last two matters and is easy to get wrong: rebuilding the
manifest wipes the measured heights and clip names, and `validate` only writes
them back when given `--write`. Run them the other way round and `tests/t38`
fails reporting zero animated models in a library full of them.

See `/UPLOADING-ASSETS.md` in the repository root for the upload routes.
