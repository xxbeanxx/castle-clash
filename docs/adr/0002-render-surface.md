# The world renders to a 640x360 art-pixel grid, presented at the largest integer scale

The client draws the world onto a virtual surface where **1 art pixel = 2 world units** (so the
28x48 hitbox is exactly 14x24 art pixels and the 1280x720 arena is exactly 640x360). That surface is
presented with `nearest` sampling at the **largest integer scale that fits the physical screen**:
`S = floor(physH / 360)`, with `physH = floor(cssH x devicePixelRatio)`. The canvas is the whole
container, not a letterboxed 16:9 box; where the screen is wider or taller than the arena (a 20:9
phone, an ultrawide, the 1280x420 Dungeon) the surplus is **overscan**: background art, never black
bars, and never gameplay information, because every arena's bounds are the same for every player.
Below 360 physical pixels of height, and only there, the scale falls back to fractional
(`physH / 360`). The sim, the wire format, and every constant in `packages/shared` are untouched.

Decided by a spike (`prototype/adr0002-render-surface`, a throwaway branch): the same mock scene
and a table of thirteen devices, phones to 4K, under each model. The alternative was a **1280x720
virtual surface with 1:1 art** (1 art pixel = 1 world unit), which gives four times the pixels per
character.

| Device (CSS, DPR)              | 640x360: scale, knight height | 1280x720: scale, knight height |
| ------------------------------ | ----------------------------- | ------------------------------ |
| iPhone SE landscape 667x375 @2 | 2x, 24 px                     | 1x, 24 px                      |
| iPhone 14 landscape 844x390 @3 | 3x, 24 px                     | 1x, 16 px                      |
| iPhone 14 Pro Max 932x430 @3   | 3x, 24 px                     | 1x, 16 px                      |
| Pixel 7 landscape 915x412 @2.6 | 3x, 27 px                     | 1x, 18 px                      |
| iPad landscape 1024x768 @2     | 3x, 36 px                     | 1x, 24 px                      |
| Desktop 1920x1080 @1           | 3x, 72 px                     | 1x, 48 px                      |
| Desktop 2560x1440 @1           | 4x, 96 px                     | 2x, 96 px                      |
| 4K 3840x2160 @1                | 6x, 144 px                    | 3x, 144 px                     |

The 1280x720 model needs 720 physical rows for its first integer step and 1440 for the next, so
most phones, iPads and every 1080p display are stuck at 1x: the knight is a third smaller than under
640x360 on phones (16-18 px against 24-27) and a third smaller on a 1080p desktop (48 against 72).
The 640x360 model has a step every 360 rows. It also costs a quarter of the art per frame. The one
thing 1280x720 buys, detail per character, is not recoverable on the devices where the choice
matters. Rejected.

The other rejected option is fractional scaling with `nearest` (or `linear`). Non-integer nearest
scaling gives uneven pixel widths that crawl as the camera moves, and linear blurs. Both look wrong
for pixel art at any resolution, which is why this decision comes before any art.

## Consequences

- **The whole arena is always on screen, so the camera stops zooming.** Every arena fits the 640x360
  grid (Dungeon is 640x210), and overscan covers the rest, so panning and zoom-to-fit have nothing
  to do. `Camera` reduces to centering plus shake, and both are applied in **whole art pixels**
  (shake included: a fractional shake shimmers exactly like fractional zoom). This deviates from the
  plan's "one discrete zoom step": that step only earns its place if a later decision crops the view
  on phones to buy a larger knight (`S + 1`, view smaller than the arena), which would bring panning
  back. Not decided here; the knight is ~24 CSS px tall on any phone under this ADR and that is the
  number to judge it by in the Phase 13 gate.
- **Today's code disagrees with the plan's F9 in a way that matters.** `GameClient.#ensureArena`
  already reads the real `app.screen` size, but only once, when the arena resolves; it never
  updates on resize or rotation. Today's camera also shows the arena at 1:1 CSS pixels (max zoom
  1), so a 1920x1080 window renders a small arena and a 667x375 phone crops it. Both go away.
- **Phase 15 draws on a 2-world-unit grid.** Sprites are authored at 1 px = 2 units, a knight
  hitbox is 14x24 px, and render positions snap to the grid (sim positions stay floats; only the
  drawn position is rounded, so motion moves in 2-unit steps and is at most one unit off the
  hitbox). Arena geometry that sits on odd unit coordinates renders up to half an art pixel off;
  Phase 15.3 should author on even coordinates rather than have the sim change.
- **Integer steps come from physical pixels, so DPR feeds the choice.** Fractional DPRs round:
  Pixel 7's 412 x 2.625 = 1081.5 floors to 1081, which is 1 row over the 3x threshold of 1080. A
  browser that reports 1079 gets 2x. That is a real, visible jump, and it is why the scaling
  function is pure, takes (CSS size, DPR), and is tested over a table of devices. Capping DPR is a
  performance lever for Phase 13 step 12, not a default: 3x of 640x360 is 1080p of fill.
- **DOM UI is unaffected.** HUD, overlays, and touch controls are DOM at CSS pixels and scale
  independently; only what draws into the canvas (world, fx, in-world text) lives on the grid.
- **Phone size is inherent, not solved.** A whole 720-unit-tall arena on a 375-430 CSS-px-tall
  screen puts the knight at about 24 CSS px. Bigger characters on phones need the crop option
  above, at the cost of seeing less of the arena than desktop players, a fairness question that is
  Phase 14+'s to raise, not this ADR's.
