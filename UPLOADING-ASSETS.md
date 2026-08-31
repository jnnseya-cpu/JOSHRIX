# Uploading the packs you bought — without GitHub Desktop

Written for one job: get purchased assets into this repository from a laptop
that no longer has GitHub Desktop on it, without losing files to a `.gitignore`
that discards them silently.

---

## Read this first — git history is permanent

`.git` in this repository is already **360 MB**, on top of ~980 MB of assets in
the working tree. GitHub starts warning past **1 GB** and refuses to be pleasant
about it well before the 5 GB hard ceiling.

**Anything pushed to git stays in git forever.** Deleting a file in a later
commit does not shrink the repository — the bytes stay in history, and the only
cure is rewriting history, which breaks every clone and every deployment that
points at a commit. So a bulk upload is not something that can be undone if it
turns out to be too much.

Which means: **do not push the raw purchased bundles.** A bundle as it comes
from the supplier contains the same models three or four times over — glTF, FBX,
`.blend` sources, Unity and Unreal packages, marketing renders, print-resolution
previews. The `.gitignore` files in each drop folder below exist to keep only
the parts the platform can actually read.

**Keep the untouched original downloads somewhere else** — Google Drive,
OneDrive, an external disk. That is your licence-proof archive and your
re-download insurance. Git is for the files the site serves.

---

## Where each kind of asset goes

The `.gitignore` in each folder decides what survives the upload. Put things in
the right one and nothing is lost; put them in the wrong one and files vanish
without git ever mentioning them.

| What you have | Drop it in | What is kept |
|---|---|---|
| **Animated 3D characters** that ship a glTF folder | `frontend/assets/models3d/_incoming/characters/` | `.glb` `.gltf` `.bin` `.png` `.jpg` |
| **Animated characters with NO glTF** — FBX only | `frontend/assets/models3d/_incoming/characters-fbx/` | `.fbx` `.png` `.jpg` |
| **Static 3D packs** (props, buildings, scenery, vehicles) | `frontend/assets/models3d/_incoming/packs/` | `.glb` `.gltf` `.bin` `.obj` `.mtl` `.png` `.jpg` |
| **2D sprites** (spritesheets, tiles, icons, UI) | `frontend/assets/sprites/_incoming/` | `.png` `.jpg` `.svg` `.xml` `.json` `.fnt` |

**Do not upload straight into `frontend/assets/models3d/packs/`.** That folder
keeps model formats only and **throws away every `.png` and `.jpg`** — a
`.gltf` or `.obj` whose textures were discarded loads as a blank grey shape, and
nothing warns you. The `_incoming/` folders above exist precisely to stop that.

Everything under `_incoming/` is excluded from the Vercel deploy by
`.vercelignore`, so it costs git history but never page-load time.

### Already done — do not re-upload

`Characters and Animals` from the Quaternius bundle is **already in the
repository**, all 20 subfolders, 736 MB. Copying it again does nothing.

Ten of those twenty were ingested and are live. The other ten arrived as nothing
but a stray `Preview.png`, because they are 2017-2019 packs that ship **FBX
only** and the filter excludes FBX. Those ten — and only those ten — go in
`_incoming/characters-fbx/`; they are listed in that folder's README.

---

## Route A — the GitHub website, nothing to install

Best when you have a few hundred files or fewer.

1. Go to the folder on github.com, e.g.
   `https://github.com/jnnseya-cpu/JOSHRIX/tree/claude/joshrix-studio-branding-hzl94h/frontend/assets/models3d/_incoming/packs`
2. **Add file → Upload files**
3. Drag the files in. You can drag a folder and it keeps the structure.
4. Commit straight to `claude/joshrix-studio-branding-hzl94h`.

The browser uploader's limits, which are not negotiable:

- **100 files per commit.** More than that and you upload in batches.
- **25 MB per file** through the browser (100 MB is the hard git limit anyway).
- Very large drags time out; if one stalls, do fewer files.

Nothing here is a problem for sprite packs or GLB sets. It becomes tedious in
the thousands, which is what Route B is for.

---

## Route B — Git on its own, for bulk

GitHub Desktop bundles git, but git is also a small standalone install and is
the only sane way to move thousands of files.

1. Install **Git for Windows** — <https://git-scm.com/download/win>. Accept the
   defaults. It is about 60 MB and has no GUI you need to learn.
2. Open **Git Bash** (installed with it) and run, once:

```bash
git clone https://github.com/jnnseya-cpu/JOSHRIX.git
cd JOSHRIX
git checkout claude/joshrix-studio-branding-hzl94h
```

3. Copy your packs into the right `_incoming/` folder from the table above,
   using Windows Explorer — normal drag and drop.

4. Then, each time you add assets:

```bash
git add .
git status            # READ THIS — it lists exactly what will be committed
git commit -m "Add <name of the pack>"
git push
```

**`git status` before `git commit` is the whole safety net.** It is the moment
you find out that the `.gitignore` kept 300 models and skipped 4,000 files of
Blender sources — which is the intended outcome, but you should see it rather
than assume it.

If a push is rejected because someone else pushed first, run `git pull` and then
`git push` again.

---

## After you upload

Tell me the pack is in and I will run the ingest:

- `tools/ingest-characters.mjs` — animated characters. Packs `.gltf` + `.bin` +
  textures losslessly into one `.glb`, repairs the known black-skin material
  bug, and writes into `packs/`.
- `tools/ingest-packs.mjs` — static 3D packs.
- `tools/ingest-sprites.mjs` — 2D sprite packs.

Then `tools/build-model-manifest.mjs` rebuilds `manifest.json`, and
`tools/validate-models.mjs` loads every new model in a real browser before any
of it is offered to the forge. A model that fails to load never reaches a game.

You can check what landed at **`/library`** — it lists every pack with its
supplier and shows which characters are animated.

---

## One honest limit

I cannot fetch these files for you. Outbound network from this build environment
is restricted by policy: it cannot reach joshrix.com, quaternius.com, poly.pizza
or mixamo.com. Cloning and pushing GitHub works, so once the files are in the
repository I can do everything else — but getting them from your laptop into the
repository is a step only you can perform.
