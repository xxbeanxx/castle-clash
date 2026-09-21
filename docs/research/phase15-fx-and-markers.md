# Phase 15: effects, name plates and ground markers

Checked 2026-09-21. "Verified" was measured or seen in the built client behind the production nginx image;
"Not verified" is open and nothing may depend on it.

## What was built

- **Effects** (plan 15.4 step 13): `viewmodel/fx.ts` (pure: event to particles, particle step, the state-driven
  run dust and roll trail) and `render/Fx.ts` (a fixed pool of 384 sprites sharing Pixi's white texture, tinted).
  Hit and block sparks, a guard-break burst, a KO poof, jump and landing dust, debris from a broken floor,
  sparks on a trap's victims, a shield flash for `ringOutArmorUsed`, dust behind a running knight, a trail
  behind a rolling one.
- **Name plates and ground markers** (plan 15.2 step 9): `render/PlayerMarkers.ts` with `viewmodel/markers.ts`.
  A coloured bar under each knight's feet (longer, lit in the middle for the local player), a name plate over
  the head, and an arrow over the local player's plate, which floats one text row higher so a duel's two
  plates do not overprint. Names are drawn in `viewmodel/pixelText.ts`, a 3x5 pixel font.
- `KnightRect` gained `name` and `isLocal`; the E2E hook gained `fxActive()`; `e2e/effects.spec.ts`.

## How effects find their place

The server's `fx` broadcast names players and hazards by id and carries no positions, so `GameClient` aims
each event at where the knight was drawn on the **last frame** (`#fxWorld`). The local player therefore sees
sparks from their own hit about half a round trip late (the sim events come from the server, not from
prediction). Effects are visual only (ADR 0001): a dropped or late event costs a spark, never a desync.

## Verified

- **Seen in the built client** (colosseum at 1280x720, castle room at 844x390): plates with the knights'
  names, the arrow over the local one, the ground bars in each player's colour, hit sparks and dust in a real
  fight against a hard bot, lit fire pits with sparks. No console errors.
- `fxActive()` reads 4-7 while running and peaks at 22-58 in a fight; the pool cap is 384.
- **Frame time** on the built client (`frameStats()`, 3 runs per arena, headless software GL): mean 16.7-17.2 ms
  in the colosseum; the dungeon ran 16.7-18.3 ms with up to 7 slow frames in 240 (the run-to-run spread on this
  machine was of that size before this change too: 16.7 and 17.6 ms in an earlier run of the same arena).
- The 3x5 font has 36 distinct letters and digits (a test), and plate text is cut to 10 characters with a
  trailing `.`.

## Deviations from the plan

- **No hitstop.** The plan asks for a visual freeze; the sim must not pause (ADR 0001), and freezing sprites
  needs per-knight animation clocks that do not exist. Camera shake (already there) stands in.
- **Dodge after-image is a particle trail**, not a ghost of the knight sprite.
- **No ring-out fall effect.** An `eliminated` event has no position once the knight is past the kill zone.
- **Name plates are uppercase, at most 10 characters.** The DOM HUD still shows the full name.

## Not verified

- **A person has not judged any of it**: spark size and colour, dust, whether the plates are legible on a real
  phone at 3x (they are 7 art px tall) or a 4K monitor at 6x, and whether the ground bars read on every arena's
  floor. This is part of Phase 15's human look gate.
- **Plates with three or four knights close together** overprint (only the local plate is lifted).
- Effects during camera shake, and on the touch layout, were not looked at.
- Whether 384 particles is enough in the busiest four-player fight (past the cap new particles are dropped
  silently).
- Colour-blind readability of the ground bars, which rely on player colour.
