# Phase 9 client rendering: tinted indicator rects instead of KnightView sprite layers

Written 2026-09-18, alongside the rest of Phase 9's implementation — same spirit as
`docs/research/phase4-knight-rendering-deviation.md`: the plan's prose assumes real knight artwork
that still doesn't exist anywhere in this repo, and the gap (now larger — layered sprites, a
`MeshRope` cape, an animation-clip system) is worth writing down before someone "fixes" the client
back toward the plan's exact wording.

## What the plan assumes

`docs/IMPLEMENTATION_PLAN.md`'s Phase 9 section describes knight art drawn in greyscale with a
separate mask layer per tint channel: `KnightView` layers for `cape` (behind, with a `MeshRope`
driven by velocity for secondary motion), `body` (tint primary), `trim` (tint secondary), `helmet`,
and `weapon` (a style texture keyed by `weaponId + styleId`), all sharing one animation clip/frame.
It also names `cosmetics/catalog.ts`'s `CosmeticItem` shape as `{ id, slot, textureKey, unlock }`
and a `catalog.test.ts` check that "every `textureKey` exists in the client asset manifest," plus a
`ci.yml` `assets:check` step cross-validating the catalog against `apps/client/public/assets/
manifest.json`.

## What actually exists in this repo

Checked directly before writing any Phase 9 client code, the same way Phase 4's check was done:
`find apps/client -iname "*sprite*" -o -iname "manifest*"` still turns up nothing but Vite build
artifacts. There is still no `KnightView`, no animation-clip system, no mask-layer rendering, and no
`assets:check` CI step — Phase 4's rect-based placeholder (`apps/client/app/game/render/
PlayerRects.ts`, `viewmodel/playersToRects.ts`) is still exactly what every match renders through,
unchanged in kind since that phase. Building the art pipeline the plan's Phase 9 prose assumes
(sourcing/producing real knight spritesheets with per-tint-channel masks, a `MeshRope`-driven cape,
an animation-clip authoring format, a `manifest.json` schema, and the CI step that validates against
it) is exactly the kind of separate, large scope Phase 4's note already flagged as belonging to its
own future "knight art asset pipeline" phase — not something Phase 9's customization/persistence/
unlock-logic work should absorb as a side effect either.

## What Phase 9 did instead

Extended the same rect placeholder Phase 4 extended, rather than building `KnightView`/a
`MeshRope` cape/an animation-clip system against art that doesn't exist:

- **Catalog shape:** `packages/shared/src/db/cosmetics.ts`'s `CosmeticItem` has a `tint?: number`
  field instead of `textureKey` — a 24-bit RGB color, applied the same "tint over `Texture.WHITE`"
  idiom Phase 2 established for the body sprite itself. A slot's `default` item has no `tint`
  (equipping it means "draw nothing for this slot," not "draw it in some particular color").
  `getCosmeticTint(itemId)` is the one place either the match renderer or the loadout preview reads
  a cosmetic item's color from.
- **Match rendering:** `viewmodel/playersToRects.ts`'s `PlayerRect` gained optional `helmetTint`/
  `capeTint` fields (a pure mapping from `PlayerState.cosmetics`, same "stays policy-free" reasoning
  Phase 4's `action` field followed). `render/PlayerRects.ts`'s `PlayerRectsView` draws each as a
  small (`10px`) indicator sprite positioned relative to the body sprite — above it for a helmet,
  to its side for a cape — added/removed independently of the body sprite as a slot is
  equipped/unequipped. Small enough to read as an accent rather than obscure the body rect
  underneath.
- **Live preview:** `game/render/CosmeticsPreview.ts` is a tiny standalone Pixi `Application`
  (`ui/LoadoutPreview.tsx`'s React wrapper) that reuses `PlayerRectsView` directly rather than a
  parallel rendering path — one static, centered `PlayerRect` (`action: "Idle"`, no camera, no room,
  no sim loop) built from the loadout form's current tint/helmet/cape state. This is Phase 9's
  `<KnightPreview>`: a real, live Pixi preview, just not one driving animation frames over sprite
  layers.
- **Weapon style:** `weaponStyleId` is persisted, RLS-validated, server-resolved against the
  catalog+unlocks the same way `helmetId`/`capeId` are, and synced onto `PlayerState.cosmetics` — but
  has no visual representation at all, client-side. This isn't a narrower version of the same
  rect-tint compromise; it's a full deferral. The reason is upstream of the art-pipeline gap this
  document is otherwise about: **no weapon is rendered as a sprite in this codebase at all**, base
  or styled (`PlayerRects.ts` draws one rect per player, period — see `weapon: this.#requireWeapon(id)`
  in `MatchRoom.ts` for where the base `WeaponId` choice already only affects gameplay stats, never
  a visual). A "weapon style" texture swap has nothing to swap onto until a future phase gives the
  base weapon its own visual in the first place.

## A related, deliberate scope decision: match-body tint stays `colorSeed`-derived

The plan's "tint" (in "a live Pixi preview (tint, helmet, cape, weapon style)") means the player's
own customized `tintPrimary`/`tintSecondary` — `player_loadouts` columns, now synced onto
`PlayerState.cosmetics.tintPrimary`/`tintSecondary`, and shown correctly in the loadout preview
(`tintPrimary` as the previewed body's tint). The actual **match** renderer (`playersToRects.ts`)
was deliberately left tinting the body sprite from `colorSeed` (`hashSeed(client.sessionId)`, Phase
2's original per-connection distinguishing color), not from `cosmetics.tintPrimary`, for one
concrete reason: `player_loadouts.tint_primary` defaults to `0` (black) and has no separate
"uncustomized" sentinel distinct from "customized to black" — see `CosmeticsState`'s own doc comment
in `packages/shared/src/schema/state.ts`. Every player who has never touched `/loadout` (which, at
Phase 9's own gate, is every existing player) has `tintPrimary = 0`. Switching the body sprite's tint
source to it would render every such player's body black and visually indistinguishable from every
other uncustomized player in the same match — a real regression to the "two browser tabs see each
other" gate Phase 2 established and every phase since has depended on for live verification.

Persistence, RLS validation, and the loadout preview's own rendering of `tintPrimary` are all real
and correct; only the match body sprite's tint source is the one place this phase intentionally kept
the old behavior rather than wiring the new field in. A future phase adding a real body/trim sprite
layer (the plan's own `body (tint primary), trim (tint secondary)`) is the natural place to resolve
this — e.g. by giving `player_loadouts.tint_primary` an actual "unset" sentinel, or a separate
`customized: boolean` column — rather than this note being read as permission to leave it unresolved
forever.

## Why this is the right call now, not deferred debt to feel bad about

Same reasoning Phase 4's note gave, applied one phase further: the unlock/persistence/validation
_rules_ this phase's plan section is actually testing for (`evaluateUnlocks`'s thresholds, RLS's
ownership checks, `MatchRoom.onJoin`'s "invalid -> default" resolution, `player_stats.wins_by_weapon`
tracking) are exactly as tested and server-authoritative as they'd be with real art on top, and
swapping rects for `KnightView` later is purely additive — `playersToRects`/`PlayerRects`/
`CosmeticsPreview` would be replaced or extended, but nothing in `packages/shared/src/db/
cosmetics.ts` or `MatchRoom`'s cosmetic-resolution logic changes, since none of it knows anything
about rendering (ADR 0001's isomorphic boundary, same as always). A future phase that adds real
knight art should build `KnightView`/a `MeshRope` cape/an animation-clip system against the
`cosmetics.helmetId`/`capeId`/`weaponStyleId`/`tintPrimary`/`tintSecondary` fields Phase 9 already
put on `PlayerState`/`PlayerRect`, rather than this note being read as permission to keep deferring
forever.
