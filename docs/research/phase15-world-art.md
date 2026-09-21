# Phase 15: world art (arenas and hazards)

Checked 2026-09-21. "Verified" was read from the file or measured in the running game; "Not verified" is
open, and nothing may depend on it until someone closes it. Companion to
`phase15-art-sources-and-pipeline.md` (which covers the knight and the sources).

## Decision (owner, 2026-09-21)

World art comes from **Kenney's CC0 packs** (the owner chose this over other CC sources and over pure
programmer art), starting with Tiny Dungeon. Anything the pack lacks (planks, flames, spikes, cracks) is
drawn in `art/world/build_atlas.py` in the same palette.

## Verified

- **Licence.** `kenney_tiny-dungeon.zip` (98,530 bytes, downloaded from
  `https://kenney.nl/media/pages/assets/tiny-dungeon/...`) contains `License.txt`: "License: (Creative
  Commons Zero, CC0) ... free to use in personal, educational and commercial projects. Support us by
  crediting Kenney ... (this is not mandatory)". The download page says the same.
- **Sheet layout.** `Tilemap/tilemap_packed.png` is 192x176: 12 x 11 tiles of 16x16, no spacing, 28 distinct
  colours. (`Tilemap/tilemap.png` has 1 px gaps and is not used.) `Tilesheet.txt` agrees.
- **What tiles.** Seamless when repeated 3x3 (checked by eye): tile 0 (plain dirt), 49 (speckled sand), 40
  and 14 (brick), 37 (metal plate). Tiles 1, 13 and 25 have studs and do not make a plain fill.
- **Palette fit.** Kenney's outline is `#3f2631`; the knight's is `#1a0e13`. The fills keep Kenney's
  colours; props have the outline recoloured to the knight's so they share one darkest colour. Both packs
  are dark, outlined and muted, and they sit together in the running game (screenshots below).
- **The arenas fit an art-pixel raster exactly.** Every solid, platform and hazard box in the six arenas and
  the tutorial arena has even unit values, so each lands on whole art pixels
  (`arenaRaster.test.ts` asserts it). The painted terrain covers exactly the pixels of the boxes
  (`arenaRaster.test.ts`, per arena).
- **Looked at in the built client** (behind the production nginx image and CSP, e2e build): all six arenas
  at 1280x720, three at 1920x1080 and two at 844x390 landscape, no console errors. Seen in the engine:
  terrain, props, active spikes, a lit fire pit (castle room), embers (dungeon), the portcullis at rest,
  intact breakable planks, and the pit's abyss. **Not seen in the engine** (covered only by unit tests): the
  gate lowering, cracked floor stages, a broken floor, a shaking or fallen platform, and a dungeon fire pit
  lit after the sparks change.
- **Loading.** The atlas is fetched alongside the join and never awaited (`GameClient.start()` rule);
  flat rects show until it lands and stay if it fails (`ArenaView`, `HazardView`, browser tests).
- **Frame time** of the running game with the backdrop: mean 16.7 ms, p95 16.7 ms, 0 slow frames over 240
  frames (colosseum and dungeon, three runs each), the same as `main` measured the same way.
- **Size.** `world.png` is about 2.5 KB; nothing near the 1 MB arena budget. The terrain is painted at
  runtime into a 640x360 texture per arena, which costs no download.

## Found by measuring: the arena must not be drawn through Pixi

The first version drew the baked arena as a full-screen Pixi sprite. In headless Chromium (software GL:
SwiftShader, which is what CI's e2e and a low-end phone are) frames went from **17 ms to 35-60 ms**
(`FrameStats`, practice match, 1280x720), and two multi-browser e2e specs timed out at 30 s
(`touch-controls` took 27.9 s alone against 16.0 s on `main`). Measured, not guessed:

- Hiding the scene mesh brought frames back to 16.7 ms with no slow frames, so it was the whole cost.
- Cost follows the area drawn: scene at 1/4 area 17.7 ms, at 0.56 of the area 24 ms, at 0.98 of it 34 ms.
- JS was not it (a CPU profile is 97% "(program)"), nor were texture uploads (0 `texImage2D` per second),
  nor alpha blending (`blendMode: "none"` did not help), nor a sprite versus a `MeshPlane` (60 ms versus
  about 40 ms).
- A raw WebGL full-screen quad in the same browser costs about 5 ms, so Pixi's per-pixel cost here is roughly
  7x the raw rate. **Why is not known**; Pixi's default mesh shader looks trivial.

The fix is `render/Backdrop.ts`: the baked arena is a DOM `<canvas>` behind a transparent Pixi canvas,
moved with the stage transform (so camera shake still moves art and knights together). A static DOM layer
measured free in the same browser (three full-size layers, still 16.7 ms), and after the change frames are
16.7 ms, equal to `main`.

## Deviations from the plan (15.3)

- **No parallax.** The camera never moves (ADR 0002), so layers would have nothing to move against. Each
  arena has one dimmed, tinted backdrop and decorative props.
- **"Auto-tiled (blob/9-slice)" became a per-pixel rasterizer.** The arena boxes are not multiples of the
  16 px tile (a wall is 10 px wide, a platform 8 px tall), so a tile grid would misalign the art from the
  collision. The rasterizer tiles a fill over the union of the boxes and finds edges per pixel.
- **The arena picture is a DOM canvas, not a Pixi sprite** (above). Hazards, being small, are Pixi sprites.
- **Kill zones are drawn in code** (a dark, dithered abyss), not from a tile; a "spikes / void / lava per
  arena" choice was not made, only void.
- **Collapsing platforms and breakable floors are drawn as plank blocks** (or the theme's material) with
  crack overlays and a jitter/fall; a broken floor just disappears (no debris; that is FX, not built).

## Not verified

- **What a person thinks of it.** Nobody has looked at the arenas on a real phone or a 4K monitor, and the
  look (bright stone next to dark backgrounds, flat dirt in the pit, the wood fill reading as bricks on
  narrow walls) is a taste call. This is the Phase 15 human gate.
- **Fire zones and the portcullis in play.** Seen in still screenshots only; nobody has judged whether the
  lit/off state is readable while fighting, or whether the dungeon's fire (40 art px tall box, 24 px flames
  plus sparks) matches where it hurts.
- **Tall hazards against their art.** The bridge's edge drops (20x360 px) are a plain dark column.
- **Timing of the collapse animation** against the sim's fall (the client only sees the phase change, so
  the drop starts when the patch arrives).
- **The other Kenney packs.** Only Tiny Dungeon was downloaded; no other pack's licence was read.
- **Colour-blind readability** of the warn state (red blink) and of fire versus embers.
- **Performance on a real low-end phone.** Frame time was measured only under headless software GL. The
  one-off painting of the 640x360 scene (about 230k pixels in JS) was not timed on a slow device.
- **Backdrop alignment on a fractional device pixel ratio.** It is placed with a CSS transform in the same
  integer physical-pixel grid as the Pixi canvas, and looked right at DPR 1 and in the e2e phone profiles,
  but a 1-physical-pixel seam between the art and the knights on, say, DPR 2.625 was not looked for.
- **Firefox and Safari.** Only Chromium was run (`image-rendering: pixelated` and `will-change` are standard,
  but nothing was checked).

## Related open findings (unchanged, still not fixed)

`combat/weapons.ts` mirrors a left-facing hitbox about the body origin (a 28-unit dead zone beside a
left-facing attacker); the knight is 21x38 px against a 14x24 px hitbox; the roll animation carries its own
root motion. See `phase15-art-sources-and-pipeline.md`.
