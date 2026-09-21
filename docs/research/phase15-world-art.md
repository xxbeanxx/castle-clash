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
  at 1280x720, three at 1920x1080 and two at 844x390 landscape. Terrain, props, spikes (active), fire pits
  (embers and lit), the portcullis, breakable planks and the pit's abyss all draw, with no console errors.
- **Loading.** The atlas is fetched alongside the join and never awaited (`GameClient.start()` rule);
  flat rects show until it lands and stay if it fails (`ArenaView`, `HazardView`, browser tests).
- **Size.** `world.png` is about 2.5 KB; nothing near the 1 MB arena budget. The terrain is painted at
  runtime into a 640x360 texture per arena, which costs no download.

## Deviations from the plan (15.3)

- **No parallax.** The camera never moves (ADR 0002), so layers would have nothing to move against. Each
  arena has one dimmed, tinted backdrop and decorative props.
- **"Auto-tiled (blob/9-slice)" became a per-pixel rasterizer.** The arena boxes are not multiples of the
  16 px tile (a wall is 10 px wide, a platform 8 px tall), so a tile grid would misalign the art from the
  collision. The rasterizer tiles a fill over the union of the boxes and finds edges per pixel.
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
- **Performance on a low-end phone.** Painting is one-off per arena and per hazard state, but nobody has
  measured the first-frame cost of the 640x360 background and terrain on a slow device.

## Related open findings (unchanged, still not fixed)

`combat/weapons.ts` mirrors a left-facing hitbox about the body origin (a 28-unit dead zone beside a
left-facing attacker); the knight is 21x38 px against a 14x24 px hitbox; the roll animation carries its own
root motion. See `phase15-art-sources-and-pipeline.md`.
