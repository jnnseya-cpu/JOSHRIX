# Drop asset-pack zips here

**Animated characters do not go here** — they need their skeleton and clips kept,
which this ingest discards. Put those in `_incoming/characters/`, which has its
own README.

Upload zips of GLB model folders into this folder (GitHub → Add file →
Upload files). Each zip becomes one pack, named after the zip file:

    nature-kit.zip   ->  packs/nature-kit/
    characters.zip   ->  packs/characters/

Then the ingest runs:

    node tools/ingest-packs.mjs          # extract GLBs, delete the zips
    node tools/build-model-manifest.mjs  # tag every model, rebuild the manifest

Zips are consumed and removed by the ingest — nothing stays archived in the
repo. Keep each zip under 25MB: that is GitHub's per-file limit for browser
uploads, and it is plenty for a few hundred low-poly GLB models.
