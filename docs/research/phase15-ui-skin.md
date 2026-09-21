# Phase 15: UI skin, part 1 (power-up cards, icons, bar frames)

Checked 2026-09-21. "Verified" was seen in the built client behind the production nginx image; "Not
verified" is open. This is the first slice of plan 15.4 step 14; the rest is listed at the end.

## What was built

- **The draft cards say what they do.** They used to show the raw id (`swiftBoots`). Each now has a pixel
  icon, a display name, its rarity, one line per thing it changes, and how far it stacks
  (`ui/DraftOverlay.tsx`, `ui/PowerUpIcon.tsx`, `content/powerups.ts`). Opponents' builds in the overlay
  use the same names.
- **Descriptions are generated, not written.** `describePowerUp` words each modifier and effect from the
  definitions in `packages/shared/src/powerups/defs.ts` (`+16 move speed`, `-10% block stamina cost`,
  `Heal 10% of the damage you deal`), keyed by `StatKey` and `EffectDef["kind"]`, so retuning a value changes
  the card and a new stat or effect kind is a compile error until it is worded. Names are a table; a test
  fails for a power-up without one.
- **18 icons**, drawn as ASCII pixel maps in `art/ui/build_icons.py` (this repository's own work, logged in
  `art/LICENSES.md`), packed into `public/assets/ui/powerups.png` (96 x 48, about 1.4 KB) and cut out by CSS
  (`.cc-icon`, 4x on a desktop, 3x on a short phone screen). A test checks the icon order against the script
  and the sheet's size against the order.
- **HP and stamina bars** are square-cornered with a 2 px dark frame, a lit top row and quarter tick marks
  (CSS only, no image).
- **Name plates no longer clip** at the arena edge (`PlayerMarkers` takes the arena's bounds); found in
  this slice's screenshots ("IR ALDRIC" against the left wall, from the effects PR).

## Verified

- Draft cards at 1280x720 and 844x390 landscape (the practice-match draft, real server): all three cards
  show icon, name, rarity, description and stacks with no overflow, no console errors. The rare and epic
  borders (steel blue, gold) and the common one (stone) are distinguishable.
- `assets:check` refused the new PNG until it was logged, as it should.
- The whole client suite (535 tests) and the browser-mode tests pass.

## Deviations from the plan

- The plan's icons are for the 18 power-ups, weapons, cosmetic thumbnails, plus a logo and landing hero. Only
  the power-up icons are done.
- The plan says panels and buttons are "9-slice pixel panels". The DOM UI kit (`ui/kit`, `tokens.css`) is
  unchanged; only the in-match overlays got the pixel treatment.

## Not verified

- **A person has not judged the icons.** Several are weak: the spiked-armour ball reads as a spiky ball, not
  armour; the boots look like a roller skate; the roll icon is a ring with a small arrowhead. Names and text
  carry the meaning; the icons are decoration that helps a glance. This is part of Phase 15's look gate.
- Colour-only rarity cues (border and label colour) and their contrast for colour-blind players; the label
  says the rarity in words.
- The pick flow on a real phone (tap targets are the whole card, 9.5 rem wide).
- The wording of a stat is a guess at what a player expects (`stamina regained per tick`, `roll
  invulnerability`); the numbers are exact.

## Still to do in 15.4 step 14

Panels and buttons as 9-slice pixel art, weapon icons (the lobby and the loadout screen), cosmetic
thumbnails, a logo and landing-page hero art (the last two must stay out of the landing page's critical
path, `check:landing`). Cosmetics as art layers and visual-regression baselines are separate Phase 15 items.
