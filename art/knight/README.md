# Knight atlas

The knight is aamatniekss's [Fantasy Knight](https://aamatniekss.itch.io/fantasy-knight-free-pixelart-animated-character)
(custom licence: read `art/LICENSES.md` before touching anything here).

The raw sheets are not in the repository. To rebuild the atlas, download `FreeKnight_v1.zip` from the
page above and run, needing only Pillow:

```sh
python3 art/knight/build_atlas.py ~/Downloads/FreeKnight_v1.zip
```

That rewrites `apps/client/public/assets/knight/knight.png` and `knight.json` (commit both).
`apps/client/app/game/render/knightAtlas.test.ts` fails if the atlas and the clip contract in
`viewmodel/knightAnimation.ts` disagree.

## Which pack sheet feeds which clip

Frames are 120x80, feet on the bottom row, body centre at column 55 (the idle pose). The
`NoMovement` variants are used where they exist, because the sim moves the knight, not the animation.

| Clip | Pack sheet | Frames |
| --- | --- | --- |
| `idle` | `Idle` | 10 |
| `run` | `Run` | 10 |
| `jump-rise`, `jump-fall` | `Jump`, `Fall` | 3, 3 |
| `dodge` | `Roll` (has root motion; the sim's dodge moves the body too) | 12 |
| `hit-stun`, `guard-broken` | `Hit` (guard-broken is a stand-in) | 1 |
| `block`, `block-stun` | `Crouch` (stand-in) | 1 |
| `dead` | `DeathNoMovement` | 10 |
| `<weapon>-attack-light`, `-air` | `AttackNoMovement`: wind-up, two swoosh, follow-through | 4 |
| `<weapon>-attack-heavy` | `Attack2NoMovement`: two wind-up, two swoosh, two follow-through | 6 |

The pack has one weapon (a sword), so mace and spear reuse the sword's frames. The pack's colours
are exactly ten opaque values (no anti-aliasing), which is what makes `paletteSwap.ts` exact.
