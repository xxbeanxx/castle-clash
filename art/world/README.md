# World atlas

Terrain fills, props and hazard frames for the arenas. Licences and provenance: `art/LICENSES.md`.

To rebuild `apps/client/public/assets/world/world.png` and `world.json` (commit both), download
`kenney_tiny-dungeon.zip` from https://kenney.nl/assets/tiny-dungeon (CC0; its `License.txt` says so)
and run, needing only Pillow:

```sh
python3 art/world/build_atlas.py ~/Downloads/kenney_tiny-dungeon.zip
```

## What comes from where

- **Kenney's Tiny Dungeon 1.0** (`Tilemap/tilemap_packed.png`, 16x16 tiles, index = row * 12 + column):
  the fills `dirt` (0), `sand` (49), `brick` (40), `stone` (14), `metal` (37), and the props `banner` (29),
  `barrel` (82), `chest` (89), `shield` (101), `gargoyle` (19), `grave` (65), `shelf` (63), `crate` (66).
  Kenney's outline colour `#3f2631` is remapped to the knight's `#1a0e13` in props, so every sprite in a
  scene shares one darkest colour. The dirt tile is one flat colour, so ten pixels are added at fixed
  positions.
- **Drawn in `build_atlas.py`** (this repository's own work): the `plank` fill, four flame frames, three spike
  plate states, two crack overlays. Flames are a formula over a few tongues, not hand-placed pixels.
- **Painted at runtime, not in the atlas:** the abyss (kill zones), the portcullis gate, the embers and
  the sparks above a tall fire zone. They are small enough to be code.

## How the world is drawn

Nothing here is laid out by hand per arena. `viewmodel/arenaRaster.ts` rasterizes the arena's `solids` and
`platforms` into a 640x360 mask, tiles a fill over it, outlines every exposed edge and lights a cap under
the top edge, so the picture is derived from the geometry that collides. `viewmodel/arenaThemes.ts` picks
fills, brightness and props per arena id. `viewmodel/hazardRaster.ts` maps a synced hazard's phase to an
image (fire on/off, spikes idle/warn/active, floor cracked stages, platform shaking/fallen).

`arenaRaster.test.ts` fails if any painted pixel disagrees with the arena's boxes; `hazardRaster.test.ts`
fails if the code asks for a frame the atlas lacks.

The baked picture (backdrop, props and terrain) is shown as a DOM canvas behind the transparent Pixi canvas
(`render/Backdrop.ts`), not as a Pixi sprite: a full-screen Pixi quad costs 35-60 ms a frame under software
GL (`docs/research/phase15-world-art.md`). Only the hazards, which are small, are Pixi sprites.

There is no parallax: the camera does not move (ADR 0002), so background layers would have nothing to
move against. The plan's "2-4 parallax layers" is one dimmed backdrop plus props.
