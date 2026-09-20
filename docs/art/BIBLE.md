# Castle Clash art bible (draft, Phase 15 step 15.0)

Status: **draft**. Rules marked _open_ wait on a person choosing the packs (decision D1: free
Creative Commons art; see `docs/research/phase15-art-sources-and-pipeline.md`). Everything else is
fixed by code that already exists.

## Fixed by the engine

- **Grid:** 640x360 art pixels, 1 art px = 2 world units, drawn at the largest integer scale that
  fits the screen (`docs/adr/0002-render-surface.md`). No sprite is ever scaled by a non-integer.
- **Hitbox:** a knight's body hitbox is 14x24 art px (28x48 units). The sprite may be larger than the
  hitbox (weapons certainly are); the hitbox stays the truth for combat.
- **Anchor:** feet, bottom-centre of the hitbox. Render positions snap to whole art pixels.
- **Sampling:** `nearest`, `roundPixels: true`, `antialias: false` (already set).
- **Facing:** art is authored facing right; the renderer flips for `facing === -1`.
- **Everything is self-hosted.** The CSP is `img-src 'self' data: blob:` with no `font-src`; no asset
  may load from a third-party origin, and pixel fonts are bitmap fonts drawn in-canvas.
- **Art stays off the landing page's critical path** (`check:landing`).

## Palette, outline, light

- One shared palette of 32-48 colours for world, knights, FX and in-canvas UI. The DOM UI's tokens
  (`app/styles/tokens.css`) are derived from it, not the other way round. _open:_ which palette (a
  palette must state that it is free to use before it is adopted; none has been checked).
- Light comes from the **top-left**. Shadows fall down-right.
- Outline: one style for every sprite (_open:_ selective outline vs full black). Packs that disagree
  are re-outlined or rejected; mixing outline styles is the fastest way to look incoherent.
- Knights have a 1 px darkest-palette outline and the strongest contrast in the scene; backgrounds
  are lower contrast and lower saturation so players read first.

## Knight layers and tint

Layers, back to front: cape, body, trim, helmet, weapon. Each is a separate sprite so cosmetics can
swap one without redrawing the rest.

- Body and trim are authored as **greyscale masks** so they can take the player's two colours
  (`tintPrimary`, `tintSecondary`). Multiply tint on a coloured sprite muddies it. _open (D6):_
  multiply-tint greyscale by default; a palette-ramp shader only if the slice looks muddy.
- Helmet and cape items are extra layers keyed by `textureKey`, not tinted indicator squares.
- A player is identified by more than colour: name plate and ground marker (plan step 9).

## Animation

The contract is `apps/client/app/game/viewmodel/knightAnimation.ts` (`LOOP_CLIPS`, `ATTACK_CLIPS`).
`assets:check` (not built yet) must fail if the atlas and that file disagree.

- **Tag names** are exactly the clip names there: `idle`, `run`, `jump-rise`, `jump-fall`, `block`,
  `block-stun`, `dodge`, `hit-stun`, `guard-broken`, `dead`, and per weapon and kind
  `<weapon>-attack-<light|heavy|air>` (`sword`, `mace`, `spear`).
- **Attack clips are startup, then active, then recovery frames, in that order.** The code stretches
  each phase's sim ticks over that phase's frames, so any frame counts work, but the frames must be
  the anticipation, the strike, and the follow-through. The strike frame is on screen for the whole
  active window. Frame counts per phase are set in `ATTACK_CLIPS` (placeholder: 2/2/3).
- Attack art must match the hitbox: sword reaches 35 art px past the body, mace 27.5, spear 55
  (`combat/weapons.ts`). The left-facing hitbox bug (Phase 14 note) should be settled first.
- Loop clips hold each frame `ticksPerFrame` ticks (60 Hz); one-shot clips hold their last frame.
- Hitstop and screenshake are visual only; the sim never pauses (ADR 0001).

## Naming and files

- Sources in `art/**` (Aseprite, if a pack ships them), exports in `apps/client/public/assets/`.
- Atlas frame names `knight/<clip>/<index>`, textures `arena/<id>/...`, `ui/...`, `fx/...`.
- Pixi does not read Aseprite `frameTags` (verified in 8.20.1); the pipeline converts tags to an
  `animations` table itself.

## Provenance and licences

Every third-party file is logged in `art/LICENSES.md` **in the same commit that adds it**: file(s),
author, source URL, licence and version, date checked, whether attribution is required, and any
modification. Prefer **CC0**. CC-BY needs a credits page. CC-BY-SA needs a decision first, because
share-alike may extend to adapted sprites. Do not commit a file whose licence you could not read
from its own page or licence file, and do not commit AI-generated art without a note saying so.

## Budgets (tune after the slice)

Initial load 3 MB or less; each arena bundle 1 MB or less; landing page: no art.
