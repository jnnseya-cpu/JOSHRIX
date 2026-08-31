/**
 * Shared asset-path resolution.
 *
 * Lives on its own because two tools must agree on it exactly:
 * tools/ingest-characters.mjs, which loads the file, and
 * tools/check-incoming.mjs, which reports whether it is there. If the checker
 * were stricter than the ingest it would cry wolf; if it were more lenient it
 * would pass a pack the ingest then silently strips. One implementation, so
 * neither can drift.
 *
 * check-incoming.mjs must run with no dependencies installed — the ingest
 * imports three.js, so this cannot live there.
 */
import fs from "node:fs";
import path from "node:path";

/* Exporters get texture filenames wrong, and a glTF has no way to say so.
 * Universal Base Characters asks for "T_Eye_Normal_png.png" and ships
 * "T_Eye_Normal.png" — Quaternius's exporter appended _png to some names and
 * not others. Left alone the image keeps a uri that resolves to nothing, and
 * every character built from that pack issues a 404 for it on load.
 *
 * So resolve in order of confidence: the exact path, the same name with the
 * exporter's spurious _png/_jpg suffix removed, then the same basename
 * anywhere in the pack — packs nest textures under Textures/ and variants of
 * it. Returns null when the file genuinely is not there.
 *
 * @param {string} dir    folder the .gltf sits in, which its uris are relative to
 * @param {string} uri    the uri exactly as written in the glTF
 * @param {string[]} [index]  every file in the pack, for the last-resort search
 * @returns {string|null}
 */
export function resolveAsset(dir, uri, index) {
  const rel = decodeURIComponent(uri);
  const exact = path.join(dir, rel);
  if (fs.existsSync(exact)) return exact;

  const ext = path.extname(rel);
  const stripped = path.join(dir, path.dirname(rel),
    path.basename(rel, ext).replace(/_(png|jpe?g)$/i, "") + ext);
  if (fs.existsSync(stripped)) return stripped;

  const want = path.basename(rel).toLowerCase();
  const wantStripped = path.basename(stripped).toLowerCase();
  const hit = (index ?? []).find((f) => {
    const b = path.basename(f).toLowerCase();
    return b === want || b === wantStripped;
  });
  return hit ?? null;
}
