#!/usr/bin/env python3
"""Builds the world atlas (terrain fills, props, hazard frames) for the client.

    python3 art/world/build_atlas.py ~/Downloads/kenney_tiny-dungeon.zip

Reads `Tilemap/tilemap_packed.png` from Kenney's Tiny Dungeon 1.0 (CC0, https://kenney.nl/assets/tiny-dungeon)
and writes `apps/client/public/assets/world/world.png` and `world.json`. The hazard frames (flames,
spikes, cracks) are drawn here from a few formulas, in the same palette; they are this repository's own
work. Kenney's pack is CC0, so the raw tilemap could be committed, but only the frames the game
uses are packed (`art/LICENSES.md` lists both).

Frame names are what `apps/client/app/game/viewmodel/arenaThemes.ts` and `render/HazardView.ts` ask
for; `render/worldAtlas.test.ts` fails if they drift. Needs Pillow.
"""

import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

OUT_DIR = Path(__file__).resolve().parents[2] / "apps/client/public/assets/world"
TILE = 16
COLUMNS = 12  # tilemap_packed.png is 12 tiles wide, no spacing

# The knight's outline colour. Kenney's own outline (#3f2631) is remapped to it in props so every
# sprite in the scene shares one darkest colour (docs/art/BIBLE.md, "Palette, outline, light").
OUTLINE = (0x1A, 0x0E, 0x13, 255)
KENNEY_OUTLINE = (0x3F, 0x26, 0x31, 255)

# Kenney tile index (row * 12 + column) per frame. Fills must tile seamlessly (checked by eye on a 3x3
# tiling); props are single sprites.
KENNEY_FILLS = {
    "fill/dirt": 0,
    "fill/sand": 49,
    "fill/brick": 40,
    "fill/stone": 14,
    "fill/metal": 37,
}
KENNEY_PROPS = {
    "prop/banner": 29,
    "prop/barrel": 82,
    "prop/chest": 89,
    "prop/shield": 101,
    "prop/gargoyle": 19,
    "prop/grave": 65,
    "prop/shelf": 63,
    "prop/crate": 66,
}

# Palette used by the drawn frames (all colours occur in Kenney's tilemap, plus the shared outline).
C = {
    "O": OUTLINE,
    "K": KENNEY_OUTLINE,
    "R": (0x76, 0x3B, 0x36, 255),
    "r": (0xBD, 0x6C, 0x4A, 255),
    "o": (0xCF, 0x82, 0x54, 255),
    "s": (0xEA, 0xA5, 0x6C, 255),
    "y": (0xF7, 0xC2, 0x82, 255),
    "g": (0x26, 0x2B, 0x44, 255),
    "b": (0x52, 0x60, 0x7C, 255),
    "B": (0x8B, 0x9B, 0xB4, 255),
    "W": (0xC0, 0xCB, 0xDC, 255),
    "e": (0xE8, 0x45, 0x37, 255),
    ".": (0, 0, 0, 0),
}


def draw(rows, palette=C):
    """An ASCII map to an RGBA image."""
    h, w = len(rows), len(rows[0])
    img = Image.new("RGBA", (w, h))
    for y, row in enumerate(rows):
        assert len(row) == w, f"ragged row {y}: {row!r}"
        for x, ch in enumerate(row):
            img.putpixel((x, y), palette[ch])
    return img


def plank_fill():
    """Two horizontal planks with a seam, grain and nails: the wood fill (Kenney has none)."""
    rows = [
        "OOOOOOOOOOOOOOOO",
        "OrrrrrrrrrrrrrrO",
        "OroooooooooooorO",
        "OrooooorooooooOO",
        "OrroooooooorrooO",
        "OrrooooooooooorO",
        "OrrrrrrrrrrrrrrO",
        "OOOOOOOOOOOOOOOO",
        "OrrrrrrrrrrrrrrO",
        "OroooooooooooorO",
        "OroorooooooooooO",
        "OrooooooooroooOO",
        "OrroooooooooorrO",
        "OrrrrrrrrrrrrrrO",
        "ORRRRRRRRRRRRRRO",
        "OOOOOOOOOOOOOOOO",
    ]
    img = draw(rows)
    # Nails, one in each plank, at the left end.
    for x, y in ((2, 2), (2, 10)):
        img.putpixel((x, y), C["B"])
    return img


def flame(frame, count=4):
    """One 16x24 flame frame, drawn from a formula so the four frames flow into each other.

    A flame is three tongues whose heights wobble on different phases; each pixel's colour depends on
    how far it is below the tongue's tip (red at the tip, orange, then yellow at the core)."""
    w, h = 16, 24
    img = Image.new("RGBA", (w, h))
    phase = frame / count
    # (centre x, half width, base height, wobble) per tongue
    tongues = ((2, 3, 10, 3), (5, 3, 15, 4), (8, 4, 20, 4), (11, 3, 14, 4), (14, 3, 10, 3))
    for x in range(w):
        top = h
        for cx, half, base, wobble in tongues:
            d = abs(x - cx)
            if d >= half:
                continue
            # triangle wave in [-1, 1], phase-shifted per tongue so they do not move in lockstep
            t = (phase + cx / 16.0) % 1.0
            tri = 4 * abs(t - 0.5) - 1
            height = base + wobble * tri - d * 3.4
            top = min(top, h - max(0, int(round(height))))
        for y in range(top, h):
            depth = y - top
            if depth == 0:
                colour = C["O"]
            elif depth < 3:
                colour = C["e"]
            elif depth < 7:
                colour = C["o"]
            else:
                colour = C["y"]
            img.putpixel((x, y), colour)
    # A bed of embers so the flame sits on something.
    for x in range(w):
        img.putpixel((x, h - 1), C["R"] if x % 3 else C["r"])
    return img


def spikes(state):
    """A 16x16 spike plate: `idle` (retracted, holes), `warn` (tips showing, red), `active`."""
    img = Image.new("RGBA", (16, 16))
    plate_top = 11
    for y in range(plate_top, 16):
        for x in range(16):
            edge = x in (0, 15) or y in (plate_top, 15)
            img.putpixel((x, y), C["O"] if edge else C["b"])
    for x in (3, 8, 12):  # the three spike positions
        if state == "idle":
            img.putpixel((x, plate_top + 2), C["g"])
            img.putpixel((x + 1, plate_top + 2), C["g"])
            continue
        height = 3 if state == "warn" else 10
        tip = C["e"] if state == "warn" else C["W"]
        for i in range(height):
            y = plate_top - 1 - i
            half = max(0, (height - 1 - i) // 3)
            for dx in range(-half, half + 2):
                px = x + dx
                if 0 <= px < 16:
                    img.putpixel((px, y), C["O"] if dx in (-half, half + 1) or i == height - 1 else tip)
                    if state == "active" and dx == half + 1 and 0 <= px < 16:
                        img.putpixel((px, y), C["B"])
    return img


def crack(stage):
    """A 16x16 overlay of dark crack pixels; stage 2 has more of them than stage 1."""
    stage1 = [(8, 0), (8, 1), (7, 2), (7, 3), (6, 4), (6, 5), (7, 6), (7, 7), (8, 8), (9, 9), (9, 10)]
    stage2 = stage1 + [(10, 11), (10, 12), (11, 13), (12, 14), (7, 8), (6, 9), (5, 10), (4, 11), (3, 12),
                       (9, 3), (10, 4), (11, 5), (12, 5)]
    img = Image.new("RGBA", (16, 16))
    for x, y in stage1 if stage == 1 else stage2:
        img.putpixel((x, y), C["O"])
    return img


def speckle(img):
    """Kenney's plain dirt tile is one flat colour; a few darker and lighter pixels, at fixed
    positions (so the build is repeatable), stop it reading as a slab."""
    for x, y in ((2, 3), (11, 1), (6, 9), (13, 12), (4, 14), (9, 6)):
        img.putpixel((x, y), C["K"])
    for x, y in ((8, 2), (1, 8), (12, 7), (5, 12)):
        img.putpixel((x, y), C["r"])


def load_kenney(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        data = z.read("Tilemap/tilemap_packed.png")
    return Image.open(io.BytesIO(data)).convert("RGBA")


def tile(sheet, index, remap_outline):
    row, col = divmod(index, COLUMNS)
    t = sheet.crop((col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE))
    if remap_outline:
        px = t.load()
        for y in range(TILE):
            for x in range(TILE):
                if px[x, y] == KENNEY_OUTLINE:
                    px[x, y] = OUTLINE
    return t


def main(zip_path):
    sheet = load_kenney(zip_path)
    sprites = {}
    for name, index in KENNEY_FILLS.items():
        sprites[name] = tile(sheet, index, remap_outline=False)
    speckle(sprites["fill/dirt"])
    sprites["fill/plank"] = plank_fill()
    for name, index in KENNEY_PROPS.items():
        sprites[name] = tile(sheet, index, remap_outline=True)
    for i in range(4):
        sprites[f"hazard/flame-{i}"] = flame(i)
    for state in ("idle", "warn", "active"):
        sprites[f"hazard/spikes-{state}"] = spikes(state)
    for stage in (1, 2):
        sprites[f"hazard/crack-{stage}"] = crack(stage)

    # One row per sprite height class is overkill: lay them out in a simple shelf, 8 sprites wide.
    per_row = 8
    names = list(sprites)
    row_h = max(im.height for im in sprites.values())
    rows = (len(names) + per_row - 1) // per_row
    atlas = Image.new("RGBA", (per_row * TILE, rows * row_h))
    frames = {}
    for i, name in enumerate(names):
        x, y = (i % per_row) * TILE, (i // per_row) * row_h
        im = sprites[name]
        atlas.paste(im, (x, y))
        frames[name] = {"frame": {"x": x, "y": y, "w": im.width, "h": im.height}}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT_DIR / "world.png", optimize=True)
    meta = {
        "image": "world.png",
        "size": {"w": atlas.width, "h": atlas.height},
        "source": "Kenney Tiny Dungeon 1.0 (CC0) plus frames drawn by art/world/build_atlas.py",
    }
    animations = {"flame": [f"hazard/flame-{i}" for i in range(4)]}
    (OUT_DIR / "world.json").write_text(
        json.dumps({"frames": frames, "animations": animations, "meta": meta}, indent=1) + "\n"
    )
    print(f"wrote {OUT_DIR / 'world.png'} ({atlas.width}x{atlas.height}, {len(names)} frames)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
