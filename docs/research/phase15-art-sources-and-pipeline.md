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

**Update, same day:** the owner then picked aamatniekss's Fantasy Knight for the knight, which is not
Creative Commons, so "free Creative Commons" is now true only of the candidate arena/UI packs
(Kenney). The 15.0 slice was built with the real knight, not placeholders. World, hazard and UI art
are still unchosen.

## Verified: candidate packs

| Pack | Licence (as stated on its page) | Size | Fit |
| --- | --- | --- | --- |
| LuizMelo, [Medieval Warrior Pack 3](https://luizmelo.itch.io/medieval-warrior-pack-3) | **CC0 1.0**; credit not required. Page also says "No generative AI was used". | 26x38 px character. Idle 10, Run 6, Jump 2, Fall 2, Attack1/2/3 4/4/5, Take Hit 3, Death 9 frames. | Best licence. **No block, dodge, guard-broken or per-weapon clips.** Attack frames are a different size from idle (a comment on the page says so). |
| rgsdev, [Animated Knight Character Pack v2.0](https://opengameart.org/content/animated-knight-character-pack-v20) | **CC-BY-SA 4.0**; asks for a link to the page in credits. A commenter notes the zip's own text says "don't resell or redistribute", which conflicts with the licence shown. | 16x16 px character in a 64x64 canvas; 4 knights, 4 weapons, shield. Idle, Run, Jump, Fall, Attack, Hit, Dead, Block. | Has block. **Share-alike** may reach our adapted sprites; needs a licence decision before use. Too small for a 14x24 hitbox. |
| aamatniekss, [Fantasy Knight](https://aamatniekss.itch.io/fantasy-knight-free-pixelart-animated-character) (**the user's preference, 2026-09-20**) | **Custom licence, not Creative Commons.** Free and commercial use, modification allowed, credit optional. "You may not redistribute or resell the assets on their own" (including image-only or compilations). "The assets can't be used in AI creations." Page also says "No generative AI was used". | Character about 38x20 px in an 80x120 canvas; 2 colour styles, each with or without outline. Idle 10, Run 10, Turn 3, Crouch, Crouch walk 8, Crouch attack 4, Slide 2, Wall hang/climb/slide, Attack 1 (4), Attack 2 (6), Jump 3+2, Fall 3+2, Hit 1, Death 10, Roll 12, Dash 2. | Best-looking animation set of the three and has two attacks, hit, death and a roll for dodge. **No block, block-stun, guard-broken, heavy attack or per-weapon clips**; about 1.6x the hitbox height. See the licence concerns below. |
| Kenney, [Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) | **CC0** | 16x16 tiles, 130 files, 2022 | Tileset and props for arenas; not animated knights. |

**Fantasy Knight licence concerns (need a person's decision, not a lawyer's reading from me):**

1. **It is not CC**, so it departs from D1 as recorded ("free Creative Commons"). The terms are
   permissive for a game but bespoke.
2. **"May not redistribute ... on their own."** Shipping the sprites inside the game is the intended
   use. Committing the raw PNGs to this repository is a separate question if the repository is or
   becomes public, since a public repo lets anyone download them on their own. Unresolved.
3. **"Can't be used in AI creations."** This project's code is largely written with Claude Code. A
   comment on the itch.io page from a user in the same position got a one-line "That's alright" from
   the author (checked 2026-09-20). That is a comment, not a change to the licence text, and the art
   would not be fed to any image generator. Whether that is enough is the owner's call; the author
   could be asked to confirm in writing.

**Decision (owner, 2026-09-20): use Fantasy Knight, and commit the files to this public repository.**
The owner was told the repository is public and that the licence forbids redistribution "on their
own", and chose to commit anyway, accepting that risk; the AI-clause was not separately confirmed
with the author. Neither concern is resolved, only accepted. Asking the author for written
permission would still close both.

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

## Verified after downloading Fantasy Knight (2026-09-20)

Measured from `FreeKnight_v1.zip` with Pillow, not taken from the listing page:

- **Frames are 120x80**, not "80x120" as the page says. Sheets are horizontal strips; the feet are on
  the bottom row of every frame. Frame counts match the page (Idle 10, Run 10, Attack 4, Attack2 6, Roll
  12, Death 10, Jump 3, Fall 3, Hit 1).
- **Idle body is 21x38 px** (x 44-65, y 42-80), body centre column ~55, not the frame centre 60. Run is 28
  wide, attacks reach to x 118 (about 60 px right of the body).
- **Exactly 10 opaque colours** in every sheet of both colour sets, alpha always 255. So an exact palette
  remap is possible and lossless (D6).
- Both `Colour1` and `Colour2` and both `Outline` / `NoOutline` variants have the same structure; only
  `Colour1/Outline` is used.
- The zip has **no licence file**; the itch.io page is the only statement of terms.
- `NoMovement` variants exist for Attack, Attack2 and Death (root motion removed, which suits a sim-driven
  body); Roll and Dash have none.
- Pixel-art look confirmed in the real client behind the production nginx image and CSP: atlas served as
  `image/png`, no console errors, recoloured knights, swoosh and flip render, `check:landing` still passes,
  and 24/24 e2e specs pass on the built client (one tutorial failure in an earlier parallel run passed on
  re-run; a touch-controls failure in another run was a real bug this change introduced and fixed, see
  `PlayerRenderer.ts`).

## Not verified

- Only Fantasy Knight has been downloaded. LuizMelo's, rgsdev's and Kenney's licences are read from
  listing pages only, and nothing from them is used.
- What the knight looks like next to any world art: no arena, hazard, FX or UI art exists yet, so the
  knight stands on the old placeholder rectangles.
- Whether the knight-to-hitbox size (21x38 px art vs 14x24 px hitbox) plays fairly. Not judged by a
  person.
- How the local knight feels: its animation follows the client's predicted state, but attack windup
  frames vs hit timing have not been played against a real opponent.
- Roll (dodge) carries its own root motion on top of the sim's dodge movement.
- The look on a phone (about 24 CSS px tall at 3x per ADR 0002) and on a 4K monitor.
- Whether the second chained light attack is distinguishable in synced state. `attackKind` is
  `light` for both; `comboCount` counts hits landed, not chain steps. If the art wants a different
  second swing, it needs a synced chain index (schema change) or one clip for both.
- Any on-device look (phone at 3x, 4K at 6x).
- Landing-page cost: art must stay out of `/`'s script graph (`check:landing`).

## Human gates

1. Pick the world (tile, hazard, background) and UI art, and any FX, after seeing them in engine.
2. Ask the knight's author for written OK on the public-repo and AI-clause terms, or keep the
   recorded acceptance; decide CC-BY / CC-BY-SA acceptability for the rest; add a credits page.
3. Approve the knight-to-hitbox size relationship by playing it (21x38 px art on a 14x24 px hitbox).
4. Sign off the look on a phone and a 4K monitor (plan's Phase 15 gate).

## Related finding (not fixed here)

`combat/weapons.ts` `hitboxWorldBox` mirrors a left-facing hitbox about the body's origin, leaving a
28-unit dead zone beside a left-facing attacker (see the Phase 14 note). Attack sprites must match
hitboxes, so this should be decided before attack art is finalised.
