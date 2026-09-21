# Art is committed as packed atlases, the world is painted from geometry, and the arena is not drawn through Pixi

Phase 15's art has four decisions that later work has to keep to.

**Sources are third-party packs and this repository's own scripts, and only what the game ships is
committed.** `art/knight/build_atlas.py` and `art/world/build_atlas.py` rebuild
`apps/client/public/assets/{knight,world}/` from a downloaded zip (Pillow only; no Aseprite, which CI
does not have). The knight pack's raw sheets are not committed, because its licence forbids
redistributing them on their own; only the packed, recoloured-at-runtime atlas is. Every file, its
licence and what was changed goes into `art/LICENSES.md` in the commit that adds it, and a licence is
read from the pack's own file or page, never assumed. CC0 is preferred; CC-BY needs a credits entry,
CC-BY-SA a decision first. This replaces the plan's `art/**/*.aseprite` sources: nothing here is authored
in Aseprite, and Pixi 8.20.1 does not read Aseprite tags anyway.

**A player's colour is an exact palette remap, not a multiply tint (D6).** The knight is ten
unantialiased colours, so `render/paletteSwap.ts` replaces the three cloth colours with a ramp of the
player's colour and leaves steel, leather and outline exactly as drawn. A multiply tint would darken the
outline and muddy the steel. The cost is that a recolourable sprite must be a small fixed palette; a
future knight with gradients needs either masks or a palette-ramp shader.

**The world is painted from `ArenaDefinition`, not laid out.** `viewmodel/arenaRaster.ts` rasterizes an
arena's solids and platforms into an art-pixel mask, tiles a fill over it and outlines exposed edges, so
what is drawn cannot disagree with what collides (a test asserts it per arena). Arena boxes are not
multiples of a 16 px tile, so this is per pixel rather than a tile grid; `viewmodel/arenaThemes.ts` picks
materials and props per arena id, and `viewmodel/hazardRaster.ts` maps a synced hazard's phase to an image.
All three are pure functions over pixel buffers (`viewmodel/raster.ts`) and run in Node tests. Boxes on odd
unit values would be rounded, so a test requires them even.

**Large static art is a DOM layer, not a Pixi sprite.** Under software GL (headless CI, low-end phones) a
full-screen Pixi quad cost 35-60 ms a frame against 17 ms without it, in proportion to the area drawn, and
timed out two e2e specs; a static DOM canvas of the same size costs nothing. So the baked arena is a
`<canvas>` behind a transparent Pixi canvas, moved with the stage transform (`render/Backdrop.ts`), and
Pixi draws only what moves: knights, hazards, effects. Anything else that covers much of the screen
(a full-screen flash, a vignette) should be a DOM element or a small number of pixels, and should be
measured with `window.__CC_DEBUG__.frameStats()` on a built client before it lands. Why Pixi's quad is so
much dearer than a raw one here was not found (`docs/research/phase15-world-art.md`).

One rule spans all of it: **`GameClient.start()` never awaits art.** Atlases are promises the views take;
until one lands flat rects show, and if it rejects they stay. A late atlas must not paint for an arena that
has since been replaced (a generation counter in `ArenaView`).
