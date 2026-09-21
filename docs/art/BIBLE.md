# Castle Clash art bible (draft, Phase 15 step 15.0)

Status: **draft**. The knight is aamatniekss's Fantasy Knight (decision D1, 2026-09-20; licence and
accepted risks in `art/LICENSES.md`, facts in `docs/research/phase15-art-sources-and-pipeline.md`).
Rules marked _open_ still wait on a person; FX and UI art are not chosen yet. Arena and hazard art (world atlas, Kenney's
CC0 Tiny Dungeon plus frames drawn in `art/world/build_atlas.py`) landed on 2026-09-21: `art/world/README.md`.

## Fixed by the engine

- **Grid:** 640x360 art pixels, 1 art px = 2 world units, drawn at the largest integer scale that
  fits the screen (`docs/adr/0002-render-surface.md`). No sprite is ever scaled by a non-integer.
- **Hitbox:** a knight's body hitbox is 14x24 art px (28x48 units). The sprite may be larger than the
  hitbox (weapons certainly are); the hitbox stays the truth for combat. The pack's knight is
  **21x38 px** at idle (1.5x the hitbox width, 1.6x its height) and its sword swing reaches about
  60 px from the body: bigger than the combat reach (sword 35 px). _open:_ whether that size
  relationship is acceptable, which needs a person playing.
- **Anchor:** feet, bottom-centre of the hitbox. Render positions snap to whole art pixels. Knight
  frames are 120x80 with the feet on the bottom row and the body centre at column 55 (`meta.pivot`
  in `knight.json`).
- **Sampling:** `nearest`, `roundPixels: true`, `antialias: false` (already set).
- **Facing:** art is authored facing right; the renderer flips for `facing === -1`.
- **Everything is self-hosted.** The CSP is `img-src 'self' data: blob:` with no `font-src`; no asset
  may load from a third-party origin, and pixel fonts are bitmap fonts drawn in-canvas.
- **Art stays off the landing page's critical path** (`check:landing`).

## Palette, outline, light

- One shared palette for world, knights, FX and in-canvas UI. The knight fixes it in practice: the
  pack uses exactly **ten opaque colours** (outline `#1a0e13`, steel `#c7c7b0 #868273 #e6e6d4
  #3a3836`, leather `#69552a #9f803f #362917`, scarf `#833c22 #481a13`), so the world art should be
  drawn from that dark, muted range and the DOM tokens (`app/styles/tokens.css`) derived from it.
  The world uses Kenney Tiny Dungeon's colours (dark browns, steel blues, one warm sand) with Kenney's outline
  remapped to the knight's `#1a0e13`; terrain is dimmed per arena (`brightness`) and backgrounds much more, so the
  knights keep the strongest contrast. _open:_ whether a person likes the combination.
- Light comes from the **top-left**. Shadows fall down-right.
- Outline: the knight uses the pack's `Outline` variant (1 px `#1a0e13`). Everything else matches it or
  is rejected; mixing outline styles is the fastest way to look incoherent.
- Knights have a 1 px darkest-palette outline and the strongest contrast in the scene; backgrounds
  are lower contrast and lower saturation so players read first.

## Knight layers and tint

Layers, back to front: cape, body, trim, helmet, weapon. Each is a separate sprite so cosmetics can
swap one without redrawing the rest.

- **D6, decided for this pack: an exact palette remap, not a multiply tint.** The pack is ten
  unantialiased colours, so `render/paletteSwap.ts` replaces only the three cloth colours (the scarf's
  two tones and the dark garment) with a ramp of the player's colour, leaving steel, leather and
  outline exactly as drawn. Previewed with blue, green and magenta: distinct and cohesive. The colour
  is normalised so its brightest channel is 220, so a near-black `colorSeed` still reads. Only the
  primary colour is applied today; the leather ramp could carry a secondary.
- Helmet and cape items are extra layers keyed by `textureKey`, not tinted indicator squares.
- A player is identified by more than colour: a ground bar in their colour and a name plate in a 3x5 pixel font
  (`render/PlayerMarkers.ts`), with an arrow over the local player's plate.

## Animation

The contract is `apps/client/app/game/viewmodel/knightAnimation.ts` (`LOOP_CLIPS`, `ATTACK_CLIPS`).
`assets:check` (not built yet) must fail if the atlas and that file disagree.

- **Clip names** are exactly the names there (the atlas's `animations` keys): `idle`, `run`, `jump-rise`, `jump-fall`, `block`,
  `block-stun`, `dodge`, `hit-stun`, `guard-broken`, `dead`, and per weapon and kind
  `<weapon>-attack-<light|heavy|air>` (`sword`, `mace`, `spear`).
- **Attack clips are startup, then active, then recovery frames, in that order.** The code stretches
  each phase's sim ticks over that phase's frames, so any frame counts work, but the frames must be
  the anticipation, the strike, and the follow-through. The strike frame is on screen for the whole
  active window. Frame counts per phase are set in `ATTACK_CLIPS` (light and air 1/2/1, heavy 2/2/2).
- **Stand-ins** (the pack has no such frames): block and block-stun use the crouch frame, guard-broken
  uses the hit frame, and mace and spear reuse the sword's swings. `render/KnightView.ts` tints
  those states so they read apart, and none of it is final.
- Attack art must match the hitbox: sword reaches 35 art px past the body, mace 27.5, spear 55
  (`combat/weapons.ts`). The left-facing hitbox bug (Phase 14 note) should be settled first.
- Loop clips hold each frame `ticksPerFrame` ticks (60 Hz); one-shot clips hold their last frame.
- Hitstop and screenshake are visual only; the sim never pauses (ADR 0001).

## Naming and files

- Packer scripts in `art/**`, output in `apps/client/public/assets/`. The pack's raw sheets are not
  committed (`art/knight/README.md` says how to rebuild).
- Knight atlas frame names `<sheet>/<index>` (e.g. `swing1/2`). World atlas names: `fill/<material>`,
  `prop/<thing>`, `hazard/<kind>-<state>`; `ui/...` and `fx/...` are reserved for the skin and Fx.
- Pixi does not read Aseprite `frameTags` (verified in 8.20.1); `art/knight/build_atlas.py` writes
  the `animations` table itself, and `KnightAtlas.ts` builds textures from it (Pixi's `Assets`
  spritesheet loader is not used, because it cannot recolour).

## Provenance and licences

Every third-party file is logged in `art/LICENSES.md` **in the same commit that adds it**: file(s),
author, source URL, licence and version, date checked, whether attribution is required, and any
modification. Prefer **CC0**. CC-BY needs a credits page. CC-BY-SA needs a decision first, because
share-alike may extend to adapted sprites. Do not commit a file whose licence you could not read
from its own page or licence file, and do not commit AI-generated art without a note saying so.

## Budgets (tune after the slice)

Initial load 3 MB or less; each arena bundle 1 MB or less; landing page: no art.
