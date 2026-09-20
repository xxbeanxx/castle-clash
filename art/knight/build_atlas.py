#!/usr/bin/env python3
"""Packs aamatniekss's Fantasy Knight sheets into one atlas for the client.

    python3 art/knight/build_atlas.py ~/Downloads/FreeKnight_v1.zip

Reads the pack's `Colour1/Outline/120x80_PNGSheets`, writes
`apps/client/public/assets/knight/knight.png` and `knight.json` (a Pixi spritesheet hash with an
`animations` table; Pixi 8 does not read Aseprite `frameTags`, and this pack ships plain strips
anyway). The raw sheets are not committed: only this script and its output, so the pack's "do not
redistribute on their own" term is touched as little as possible. See `art/LICENSES.md`.

The clip names MUST match `apps/client/app/game/viewmodel/knightAnimation.ts`;
`knightAtlas.test.ts` fails if they drift. Needs Pillow.
"""

import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

FRAME_W, FRAME_H = 120, 80
# Body centre column of the idle pose (idle occupies x 44..65 of the 120 px frame) and the feet
# row (the bottom row of every frame). The client anchors the sprite here.
PIVOT = {"x": 55, "y": 80}
COLUMNS = 10
SHEET_DIR = "Colour1/Outline/120x80_PNGSheets/"

# atlas sheet name -> file in the pack. The "NoMovement" variants keep the body still inside the
# frame, which is what we want because the sim moves the knight, not the animation.
SHEETS = {
    "idle": "_Idle.png",
    "run": "_Run.png",
    "jump": "_Jump.png",
    "fall": "_Fall.png",
    "roll": "_Roll.png",
    "hit": "_Hit.png",
    "death": "_DeathNoMovement.png",
    "crouch": "_Crouch.png",
    "swing1": "_AttackNoMovement.png",
    "swing2": "_Attack2NoMovement.png",
}

# clip name -> sheet. Stand-ins are noted in knightAnimation.ts.
CLIPS = {
    "idle": "idle",
    "run": "run",
    "jump-rise": "jump",
    "jump-fall": "fall",
    "block": "crouch",
    "block-stun": "crouch",
    "dodge": "roll",
    "hit-stun": "hit",
    "guard-broken": "hit",
    "dead": "death",
}
for weapon in ("sword", "mace", "spear"):
    CLIPS[f"{weapon}-attack-light"] = "swing1"
    CLIPS[f"{weapon}-attack-air"] = "swing1"
    CLIPS[f"{weapon}-attack-heavy"] = "swing2"


def load_sheets(source: Path) -> dict[str, Image.Image]:
    sheets = {}
    if source.suffix == ".zip":
        with zipfile.ZipFile(source) as z:
            for name, fn in SHEETS.items():
                sheets[name] = Image.open(io.BytesIO(z.read(SHEET_DIR + fn))).convert("RGBA")
    else:
        for name, fn in SHEETS.items():
            sheets[name] = Image.open(source / SHEET_DIR / fn).convert("RGBA")
    return sheets


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sheets = load_sheets(Path(sys.argv[1]).expanduser())

    frames: list[tuple[str, Image.Image]] = []
    for name, sheet in sheets.items():
        assert sheet.size[1] == FRAME_H and sheet.size[0] % FRAME_W == 0, (name, sheet.size)
        for i in range(sheet.size[0] // FRAME_W):
            frames.append((f"{name}/{i}", sheet.crop((i * FRAME_W, 0, (i + 1) * FRAME_W, FRAME_H))))

    rows = -(-len(frames) // COLUMNS)
    atlas = Image.new("RGBA", (COLUMNS * FRAME_W, rows * FRAME_H), (0, 0, 0, 0))
    hash_: dict[str, dict] = {}
    for n, (fname, img) in enumerate(frames):
        x, y = (n % COLUMNS) * FRAME_W, (n // COLUMNS) * FRAME_H
        atlas.paste(img, (x, y))
        hash_[fname] = {
            "frame": {"x": x, "y": y, "w": FRAME_W, "h": FRAME_H},
            "sourceSize": {"w": FRAME_W, "h": FRAME_H},
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME_W, "h": FRAME_H},
        }

    animations = {
        clip: [f"{sheet}/{i}" for i in range(sheets[sheet].size[0] // FRAME_W)]
        for clip, sheet in CLIPS.items()
    }

    out = Path(__file__).resolve().parents[2] / "apps/client/public/assets/knight"
    out.mkdir(parents=True, exist_ok=True)
    atlas.save(out / "knight.png", optimize=True)
    meta = {
        "image": "knight.png",
        "format": "RGBA8888",
        "size": {"w": atlas.size[0], "h": atlas.size[1]},
        "scale": "1",
        "frameSize": {"w": FRAME_W, "h": FRAME_H},
        "pivot": PIVOT,
        "source": "aamatniekss, Fantasy Knight (Colour1/Outline); see art/LICENSES.md",
    }
    (out / "knight.json").write_text(
        json.dumps({"frames": hash_, "animations": animations, "meta": meta}, indent=1) + "\n"
    )
    print(f"{len(frames)} frames -> {out}/knight.png {atlas.size}, {len(animations)} clips")


if __name__ == "__main__":
    main()
