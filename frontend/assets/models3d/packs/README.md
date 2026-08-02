# Adding asset packs

## The rule that matters

**Copy only 3D model folders. Never the whole bundle.**

Asset bundles are mostly 2D: sprites, tilemaps, UI, fonts, audio. Kenney's
all-in-1 is over 100,000 files, of which a few thousand are 3D models. Copying
the bundle whole freezes any git client before it ever reaches a commit — the
tool has to scan every file to decide what to skip.

Inside each bundle, take only:

- Kenney: the `3D assets` folder (skip `2D assets`, `Audio`, `UI`, fonts)
- Quaternius: the category folders you want — `Characters and Animals`,
  `Nature`, `Medieval`, `Home and Buildings`, `Space` (skip `Animation`,
  which holds no models)
- Inside a pack, skip any `Blend` folder — Blender sources, unusable in a
  browser and the largest files by far

That is a few thousand files instead of a hundred thousand, and every git
client handles it without complaint.

## Getting them in

Copy the folders into this directory in your local clone, then commit and
push with GitHub Desktop or `git`. `.gitignore` here stages only `.glb`,
`.gltf`, `.bin`, `.obj` and `.mtl` — anything else that sneaks in is skipped
automatically.

## What happens next

    node tools/obj-to-glb.mjs frontend/assets/models3d/packs   # OBJ/MTL -> GLB
    node tools/build-model-manifest.mjs                        # tag + index

Models are converted to GLB (the only format a browser loads directly),
normalised to sit on y=0, tagged by theme from their filenames, and moved out
of `packs/` into their own library folder. The source files are then deleted
so the repo stays lean, and the Code Agent's 3D catalogue is updated so
forges can use the new models by name.

## Formats

GLB is what ships. GLTF+BIN and OBJ+MTL both convert cleanly (the Quaternius
vehicle packs arrived as OBJ and converted losslessly — their materials are
solid colours). FBX does not convert here; if a pack ships FBX only, say so
rather than assuming its models were included.
