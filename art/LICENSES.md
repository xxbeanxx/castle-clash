# Third-party art log

Every third-party asset committed to this repository is listed here, in the same commit that adds
it. Rules are in `docs/art/BIBLE.md` ("Provenance and licences").

| Files | Author | Source URL | Licence | Checked | Attribution needed | Modified |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/client/public/assets/knight/knight.png`, `knight.json` | aamatniekss | https://aamatniekss.itch.io/fantasy-knight-free-pixelart-animated-character (`FreeKnight_v1.zip`, 493 kB) | **Custom licence, not Creative Commons**, stated only on the itch.io page (the zip has no licence file): free and commercial use, modification allowed, credit optional (appreciated); "may not redistribute or resell the assets on their own"; "can't be used in AI creations". Page also says "No generative AI was used". | 2026-09-20 | No (credit appreciated; add it to a credits page) | Yes: ten sheets from `Colour1/Outline` packed into one atlas by `art/knight/build_atlas.py`; the player colour is applied at runtime by exact palette remap (`paletteSwap.ts`). No pixels were edited. |

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
