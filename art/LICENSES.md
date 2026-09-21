# Third-party art log

Every third-party asset committed to this repository is listed here, in the same commit that adds
it. Rules are in `docs/art/BIBLE.md` ("Provenance and licences").

| Files | Author | Source URL | Licence | Checked | Attribution needed | Modified |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/client/public/assets/knight/knight.png`, `knight.json` | aamatniekss | https://aamatniekss.itch.io/fantasy-knight-free-pixelart-animated-character (`FreeKnight_v1.zip`, 493 kB) | **Custom licence, not Creative Commons**, stated only on the itch.io page (the zip has no licence file): free and commercial use, modification allowed, credit optional (appreciated); "may not redistribute or resell the assets on their own"; "can't be used in AI creations". Page also says "No generative AI was used". | 2026-09-20 | No (credit appreciated; given on the About page) | Yes: ten sheets from `Colour1/Outline` packed into one atlas by `art/knight/build_atlas.py`; the player colour is applied at runtime by exact palette remap (`paletteSwap.ts`). No pixels were edited. |
| `apps/client/public/assets/world/world.png`, `world.json` (fills, props) | Kenney (www.kenney.nl) | https://kenney.nl/assets/tiny-dungeon (`kenney_tiny-dungeon.zip`, 98 kB, Tiny Dungeon 1.0, 2022) | **CC0 1.0**. Read from the zip's own `License.txt` ("free to use in personal, educational and commercial projects"; crediting Kenney is not mandatory) and matching the download page. | 2026-09-21 | No (credit appreciated; given on the About page) | Yes: eight props and five fills cut from `Tilemap/tilemap_packed.png` (indices in `art/world/README.md`); Kenney's outline `#3f2631` recoloured to `#1a0e13` in props; ten pixels added to the flat dirt tile. Packed by `art/world/build_atlas.py`. |
| `world.png`, `world.json` (plank fill, flame, spikes, crack frames) | This repository | n/a (drawn by `art/world/build_atlas.py` from a pixel map and formulas, in Kenney's palette) | Same terms as this repository's own code. **Made by an AI coding assistant (Claude Code)** writing the pixel maps and formulas; no image generator was used and no third-party art was given to any model. | 2026-09-21 | No | n/a |
| `apps/client/public/assets/ui/powerups.png` (the 18 power-up icons) | This repository | n/a (drawn as ASCII pixel maps in `art/ui/build_icons.py`, in the world atlas's palette) | Same terms as this repository's own code. **Made by an AI coding assistant (Claude Code)** writing the pixel maps; no image generator was used and no third-party art was given to any model. | 2026-09-21 | No | n/a |

## Accepted risks (owner decision, 2026-09-20)

- **The repository is public**, so the packed atlas is downloadable on its own, which the licence
  appears to forbid. The owner was told and chose to commit it. The raw sheets are deliberately NOT
  committed (only the packer script and its output), to keep the exposure to what the game ships.
- **"Can't be used in AI creations."** This project's code is largely written with an AI coding
  assistant; the art is never given to an image generator. The author answered a commenter in the
  same position with "That's alright" on the itch.io page (2026-09-20). That is a comment, not a
  change to the licence text. Neither point is confirmed with the author in writing.

If the author objects, remove `apps/client/public/assets/knight/` and `art/knight/`; the client falls
back to tinted rects (`PlayerRenderer.ts`) without them.
