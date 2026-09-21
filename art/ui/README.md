# UI art

`build_icons.py` draws the 18 power-up icons as ASCII pixel maps and writes
`apps/client/public/assets/ui/powerups.png` (6 x 3 tiles of 16 x 16 px, each icon 12 x 12 centred). Run it
with `python3 art/ui/build_icons.py` (Pillow only) and commit the PNG. The icons are this repository's own
work (`art/LICENSES.md`).

- **Adding a power-up:** draw its icon in `ICONS`, add its id at the same position in `POWERUP_ICON_ORDER`
  (`apps/client/app/content/powerups.ts`) and give it a display name there; `content/powerups.test.ts` fails
  until the order, the sheet size and the names all agree.
- **Showing one:** `ui/PowerUpIcon.tsx` cuts a tile out of the sheet with CSS (`.cc-icon` in `game.css`,
  4x, or 3x on a short phone screen). The description on a card is generated from the power-up's modifiers
  in `packages/shared`, so it cannot drift from what the power-up does.
