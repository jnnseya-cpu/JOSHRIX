# Activating the external asset packs (Kenney · Quaternius · KayKit)

The `wonder/` pack is JOSHRIX-original and already live. To add the three
professional CC0 libraries, the .glb files must be uploaded here — the build
environment cannot download them itself, so this step is done once, by hand,
from a normal browser. All three are CC0: commercial use, redistribution, and
hosting on joshrix.com are all explicitly allowed, no attribution required.

## 1. Download (free)

- **Kenney — Nature Kit**: https://kenney.nl/assets/nature-kit → "Download"
- **Kenney — Castle Kit**: https://kenney.nl/assets/castle-kit
- **Quaternius — Ultimate Animated Character Pack**: https://quaternius.com/packs/ultimatedanimatedcharacter.html
- **KayKit — Dungeon Remastered**: https://kaylousberg.itch.io/kaykit-dungeon-remastered → "Download Now" → £0

## 2. Extract the GLB/GLTF models

Each zip has a `Models/GLTF format/` (Kenney), `glTF/` (Quaternius) or
`Assets/gltf/` (KayKit) folder. The `.glb` files inside are the ones we host.

## 3. Upload into this repo (GitHub web UI — no tools needed)

On github.com open this folder (`frontend/assets/models3d/packs/`) →
**Add file → Upload files** → create one folder per pack and drag the .glb
files in:

    packs/kenney-nature/   *.glb
    packs/kenney-castle/   *.glb
    packs/quaternius-characters/ *.glb
    packs/kaykit-dungeon/  *.glb

Keep the upload under ~40MB per pack (pick the best models — 50-150 per pack
is plenty; skip duplicates and oversized showcase pieces).

## 4. Tell the assistant "packs uploaded"

The manifest (`../manifest.json`) and the Code Agent's asset catalogue are
then regenerated to include every uploaded model, tagged by theme, so forges
across every genre — nature, castle, dungeon, characters — dress their worlds
with these models automatically.
