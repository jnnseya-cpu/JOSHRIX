/* FBXLoader reaches for `window` in exactly two places, and both are hit by
 * real Quaternius packs rather than by anything exotic:
 *
 *   - a camera node reads window.innerWidth/innerHeight to work out an aspect
 *     ratio. The 2016 Animals Pack ships a camera in every FBX, which is why
 *     Chick, Fish, Red Fox, Whale and bird all failed with "window is not
 *     defined" and five animals were silently lost.
 *   - an embedded binary texture is handed to window.URL.createObjectURL.
 *
 * The camera is discarded on import anyway, so the numbers only have to be
 * plausible; a 16:9 aspect is what a browser would most likely have given it.
 *
 * three's only other use of `window` is stamping window.__THREE__ with its
 * revision, so defining this cannot switch three onto a browser-only path. */
globalThis.window = globalThis.window ?? {
  innerWidth: 1920,
  innerHeight: 1080,
  URL: globalThis.URL,
};

// GLTFExporter expects a browser FileReader; Node 22 has Blob but not FileReader.
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend && this.onloadend(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64'); this.onloadend && this.onloadend(); }); }
};
