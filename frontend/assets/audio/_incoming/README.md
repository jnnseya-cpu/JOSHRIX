# Audio packs

The one place in this repository that keeps sound files.

Drop a whole pack in — `.wav`, `.ogg`, `.mp3`, `.m4a`, `.flac`, `.aac`,
`.opus` and `.webm` all survive, along with the licence beside them.

**Do not put audio in `models3d/_incoming/packs/`.** That folder keeps model
and image formats and discards everything else, so a 27 MB sound pack measures
as 0 MB there and would be lost without an error — the same way eight character
packs disappeared on 22 Aug.

After uploading:

```bash
node tools/check-incoming.mjs audio
```

One line per pack: what git keeps, what it drops, and a warning for anything
that would land with nothing playable in it.
