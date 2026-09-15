# Phase 4 client rendering: rect-based combat feedback instead of KnightView sprites

Written 2026-09-15, alongside the rest of Phase 4's implementation — not investigation of an
external API like the other `docs/research/` notes, but a recorded scope decision, in the same
spirit: the plan's prose assumes something that isn't actually true of this repo's current state,
and the gap is worth writing down before someone "fixes" the client back toward the plan's exact
wording.

## What the plan assumes

`docs/IMPLEMENTATION_PLAN.md`'s Phase 4 section describes a client render layer built on real
knight artwork: `viewmodel/knightAnimation.ts` (`(action, actionTick, weapon) → {clip, frame}`),
`render/KnightView.ts` (layered `AnimatedSprite`s for body and weapon, flipped by `facing`), and
`render/Fx.ts` (hit sparks, hitstop, screen shake), tested against "a spritesheet fixture" and
validated in CI by an `assets:check` step against a `manifest.json`.

## What actually exists in this repo

Checked directly before writing any Phase 4 client code: no spritesheet, no `manifest.json`, no
asset-bundle tooling of any kind exists anywhere under `apps/client/` (`find apps/client -iname
"*sprite*" -o -iname "manifest*"` turns up nothing but a Vite build artifact). Phase 2/3's client
render layer (`apps/client/app/game/render/PlayerRects.ts`, `viewmodel/playersToRects.ts`) is
already a deliberate placeholder — one tinted `Sprite` per player over `Texture.WHITE`, not real
art — and CLAUDE.md documents it as such. There is no art pipeline to plug `KnightView` into yet;
building one (sourcing/producing actual knight spritesheets, an animation-clip authoring format, a
`manifest.json` schema, and the `assets:check` CI step that validates against it) is real,
separate scope that a knight-art asset pipeline phase would own, not something Phase 4's combat
*logic* work should absorb as a side effect.

## What Phase 4 did instead

Extended the existing rect placeholder rather than building `KnightView`/`Fx`/`knightAnimation.ts`
against art that doesn't exist:

- `viewmodel/playersToRects.ts`'s `PlayerRect` gained an `action: string` field (the player's raw
  `ActionState`), keeping the mapping itself a pure, policy-free `MatchState -> rect[]` function —
  it doesn't decide what any state *looks like*.
- `render/PlayerRects.ts`'s `actionOverride()` maps `ActionState` to a tint/alpha override: red for
  HitStun, orange for GuardBroken, blue for Block/BlockStun, white for AttackActive (a swing
  flash), translucent for Dodge (reads as "currently invulnerable"), dim gray for Dead. This is
  Phase 4's stand-in for `Fx.ts`'s hit sparks/hitstop/screen shake and `KnightView`'s
  animation-driven look — coarser, but it makes every state in the FSM legible on screen with zero
  art dependencies, which is what the Phase 4 gate ("a two-player local duel is playable") actually
  needs.
- HP/stamina bars landed as plain React (`apps/client/app/ui/CombatHud.tsx`), matching the plan's
  "HUD: HP and stamina bars in React" step exactly — that part of the plan didn't depend on art and
  needed no deviation.

## Why this is the right call now, not deferred debt to feel bad about

Phase 2 already established the precedent (`PlayerRects` instead of a real player sprite) and
CLAUDE.md documents it as intentional, not a shortcut nobody noticed. The same reasoning applies
here: combat *rules* (the FSM, weapon frame data, hit resolution) are exactly as tested and
server-authoritative as they'd be with real art on top, and swapping rects for `KnightView` later
is purely additive — `playersToRects`/`PlayerRects` would be replaced or extended, but nothing in
`packages/shared/src/combat/**` changes, since the isomorphic sim already knows nothing about
rendering (ADR 0001). A future phase that adds real knight art should build `knightAnimation.ts` /
`KnightView.ts` / `Fx.ts` against the `action`/`attackKind`/`weapon` fields Phase 4 already put on
`PlayerRect`/`MatchState`, rather than this note being read as permission to keep deferring
forever.
