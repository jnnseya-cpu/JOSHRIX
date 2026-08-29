# Static 3D packs — drop them here

Props, buildings, scenery, vehicles. Anything without a walk cycle.
Animated characters go in `../characters/` instead.

Copy the whole pack folder in — the ingest walks subdirectories, so you do not
need to find the right one. The `.gitignore` here keeps the models AND their
textures; `../../packs/` keeps models only and silently drops every `.png`,
which is why this folder exists.

Excluded from the Vercel deploy, so nothing here slows the site down.

See `/UPLOADING-ASSETS.md` in the repository root for the full instructions.
