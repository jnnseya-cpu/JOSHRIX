# Drop animated character packs here

Characters go here rather than in `_incoming/` because they need a different
ingest: a crate is a shape, but a character is a shape **plus a skeleton plus
animation clips**, and the ordinary pack ingest throws the skeleton away.

## What to upload, in the order that helps most

| Priority | Pack | Why it matters |
|---|---|---|
| 1 | **Quaternius — Ultimate Animated Characters** | The library has 2,273 models and only ten are people. This is the single biggest gap, and you already own it. |
| 2 | **Quaternius — Monsters** | Enemies that are not a recoloured slime. |
| 3 | **Quaternius — Animals** | Companions, wildlife, mounts. |
| 4 | **Mixamo characters** | Free with an Adobe account, and the most human-proportioned option. Optional — do the Quaternius ones first. |

Kenney's **City Kit** is missing too, but it is ordinary static models — it does
**not** belong here. Zip it and drop it in `_incoming/` instead.

## How to upload

One folder per pack. Name the folder after the pack:

    _incoming/characters/
      quaternius-ultimate-characters/
      quaternius-monsters/

**Upload the `glTF` folder if the pack has one.** Every Quaternius pack does.
It matters more than it sounds: glTF files are copied straight into the library
with nothing re-encoded, so nothing can be lost or corrupted on the way in. FBX
has to be parsed and re-exported, and every re-export is a chance to break the
rig, the skin or the clip names.

    quaternius-ultimate-characters/
      glTF/
        Character_Male_1.glb
        Character_Female_1.glb
        ...

If the pack only ships FBX, upload the FBX plus its texture folder. That works,
it is just the longer road.

### Mixamo specifically

Mixamo splits a character across several downloads, and the settings matter:

1. Pick a character, then **Download** → Format **FBX Binary (.fbx)**, Pose **T-pose**.
2. For each animation you want, choose it, then **Download** → Format
   **FBX Binary (.fbx)**, Skin **Without Skin**, Frames per second **30**.
3. **Name the animation files after the animation** — `Walking.fbx`, `Running.fbx`,
   `Jumping.fbx`, `Standing Idle.fbx`.

That last step is not housekeeping. Every clip Mixamo exports is internally
named `mixamo.com`, so the filename is the only thing that says which animation
it is. Get it wrong and a game asking for `run` gets whatever loaded first.

Animation files with no mesh in them are applied to every character in the same
folder, so you only need to download each animation once.

## Then

Tell me they are uploaded, and I run:

    npm i three@0.160.0
    node --import ./tools/gltf-export-polyfill.mjs \
         tools/ingest-characters.mjs \
         frontend/assets/models3d/_incoming/characters quaternius-characters
    node tools/validate-models.mjs        # loads every model in a real browser
    node tools/build-model-manifest.mjs   # rebuilds the manifest the forge reads

Nothing is trusted on the way in: every converted model is opened in a real
browser and rendered before it is allowed into the library, because a model that
parses is not the same as a model that looks right. That check is why the
library has no wireframes and no blank white characters in it.

Then the new names go into the forge's catalogue, and games can use them.
