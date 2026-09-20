# Phase 15: art sources, scale fit, and pipeline facts

Checked 2026-09-20 for step 15.0. Everything under "Verified" was read from the page or the
installed package named beside it. Everything under "Not verified" is an open question, and no code
may depend on it until someone closes it.

## Decision D1 (recorded)

**Art comes from free Creative Commons packs.** No commission, no paid packs, no budget. This
replaces the plan's recommended hybrid (commissioned knights). Consequences the plan assumed away:

- Packs have no tint masks. Cosmetics (D6) and the two-colour knight need greyscale or layered
  sprites; a finished coloured knight can only be recoloured by a palette swap, not a multiply tint.
- Packs have no per-weapon attack clips, and no clip is timed to `combat/weapons.ts`. Timing is
  done in code (`viewmodel/knightAnimation.ts` stretches each phase over the art's frames), so the
  art's frame count is free; its silhouette is not.
- Cohesion across packs (palette, outline, light direction) is on us: see `docs/art/BIBLE.md`.

The 15.0 spike uses generated placeholder art, so D1 does not decide the look yet. Choosing the
actual pack is a look decision and needs a person (see "Human gates").

## Verified: candidate packs

| Pack | Licence (as stated on its page) | Size | Fit |
| --- | --- | --- | --- |
| LuizMelo, [Medieval Warrior Pack 3](https://luizmelo.itch.io/medieval-warrior-pack-3) | **CC0 1.0**; credit not required. Page also says "No generative AI was used". | 26x38 px character. Idle 10, Run 6, Jump 2, Fall 2, Attack1/2/3 4/4/5, Take Hit 3, Death 9 frames. | Best licence. **No block, dodge, guard-broken or per-weapon clips.** Attack frames are a different size from idle (a comment on the page says so). |
| rgsdev, [Animated Knight Character Pack v2.0](https://opengameart.org/content/animated-knight-character-pack-v20) | **CC-BY-SA 4.0**; asks for a link to the page in credits. A commenter notes the zip's own text says "don't resell or redistribute", which conflicts with the licence shown. | 16x16 px character in a 64x64 canvas; 4 knights, 4 weapons, shield. Idle, Run, Jump, Fall, Attack, Hit, Dead, Block. | Has block. **Share-alike** may reach our adapted sprites; needs a licence decision before use. Too small for a 14x24 hitbox. |
| Kenney, [Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) | **CC0** | 16x16 tiles, 130 files, 2022 | Tileset and props for arenas; not animated knights. |

Other CC0 sources worth a look for arenas/UI (not opened): Kenney's other packs. Prefer CC0: CC-BY
means a credits screen, CC-BY-SA means a legal read.

## Verified: how the art fits the sim

- The world is a 640x360 art-pixel grid, 1 art px = 2 world units (ADR 0002). `PLAYER_WIDTH x
  PLAYER_HEIGHT` is 28x48 units = **14x24 art px**.
- LuizMelo's 26x38 character is 1.9x wider and 1.6x taller than the hitbox; rgsdev's 16x16 is
  wider-than-tall against a tall hitbox. Either pack needs the sprite scaled (breaks the shared
  pixel grid) or drawn larger than its hitbox. A sprite larger than its hitbox is normal; a sprite
  1.6x larger changes how fair hits look, so this is a look decision for a person.
- Weapon reach from `combat/weapons.ts`, beyond the body edge: sword 70 units = 35 art px, mace 55
  = 27.5 px, spear 110 = 55 px. A 26 px character swinging a 55 px spear needs the weapon drawn
  separately, as a layer, not baked into the body frames.
- Today `render/PlayerRects.ts` draws a **32x32-unit square**, not the 28x48 hitbox, so the rect
  already disagrees with combat. Real art fixes this; nobody has judged hit fairness by eye.
- Everything needed to pick a clip is already synced on `PlayerState`: `action`, `actionTick`
  (per-state, reset on every `ActionState` change, keeps counting in Idle/Run), `attackKind`,
  `weapon`, `vx`, `vy`, `facing`. No schema change (`fsm.ts` `actionTick + 1 >= ...`).

## Verified: Pixi 8.20.1 and the plan's pipeline claim

The plan (15.1 step 3) says Aseprite's JSON hash is read natively "with animation tags -> `animations`".
**That is wrong for this version.** `pixi.js@8.20.1` types `meta.frameTags` in
`lib/spritesheet/Spritesheet.d.ts` but nothing in `lib/**` reads it; `Spritesheet` builds
`animations` only from a top-level `data.animations` map (`Spritesheet.mjs`, "Parse animations
config"). So the pipeline needs its own step that turns `frameTags` (or a hand-written table, for
packs that are plain PNG strips) into `animations`. That step is what `assets:check` should also
read. Not built yet.

## Not verified

- **No pack has been downloaded or looked at.** Licences are read from listing pages; the zips'
  own licence files were not read. Do that before committing any file, and log it in
  `art/LICENSES.md` (does not exist yet; the bible requires it).
- Whether the itch.io "CC0" claim holds for every file in LuizMelo's zip.
- What either pack looks like next to Kenney tiles at one shared palette.
- D6 (tint technique) on any real sprite. Multiply tint on a coloured sprite is expected to look
  muddy; a greyscale-plus-palette-swap route is untried.
- Whether the second chained light attack is distinguishable in synced state. `attackKind` is
  `light` for both; `comboCount` counts hits landed, not chain steps. If the art wants a different
  second swing, it needs a synced chain index (schema change) or one clip for both.
- Any on-device look (phone at 3x, 4K at 6x).
- Landing-page cost: art must stay out of `/`'s script graph (`check:landing`).

## Human gates

1. Pick the actual knight, tile and UI packs (or one pack for all) after seeing them in engine.
2. Decide CC-BY / CC-BY-SA acceptability, and that a credits page is acceptable.
3. Approve the knight-to-hitbox size relationship.
4. Sign off the look on a phone and a 4K monitor (plan's Phase 15 gate).

## Related finding (not fixed here)

`combat/weapons.ts` `hitboxWorldBox` mirrors a left-facing hitbox about the body's origin, leaving a
28-unit dead zone beside a left-facing attacker (see the Phase 14 note). Attack sprites must match
hitboxes, so this should be decided before attack art is finalised.
