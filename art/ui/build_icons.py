#!/usr/bin/env python3
"""Draws the 18 power-up icons and packs them into one sheet for the client.

    python3 art/ui/build_icons.py

Writes `apps/client/public/assets/ui/powerups.png`: 6 columns x 3 rows of 16x16 tiles, each holding a
12x12 icon centred (2 px margin), in the world atlas's palette. Icons are drawn here as ASCII pixel
maps, so this repository owns them (`art/LICENSES.md`); no third-party art and no image generator.

The tile order is `ICONS` below and MUST match `POWERUP_ICON_ORDER` in
`apps/client/app/content/powerups.ts` (a test reads both). Needs Pillow.
"""

from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / "apps/client/public/assets/ui/powerups.png"
TILE, COLS = 16, 6

PALETTE = {
    ".": (0, 0, 0, 0),
    "O": (0x1A, 0x0E, 0x13, 255),  # the shared outline
    "w": (0xFF, 0xFF, 0xFF, 255),
    "W": (0xC0, 0xCB, 0xDC, 255),
    "B": (0x8B, 0x9B, 0xB4, 255),
    "b": (0x52, 0x60, 0x7C, 255),
    "d": (0x26, 0x2B, 0x44, 255),
    "r": (0xE8, 0x45, 0x37, 255),
    "R": (0x76, 0x3B, 0x36, 255),
    "o": (0xCF, 0x82, 0x54, 255),
    "y": (0xF7, 0xC2, 0x82, 255),
    "s": (0xEA, 0xA5, 0x6C, 255),
    "T": (0x43, 0xE1, 0xB3, 255),
}


def mirrored(half):
    """A symmetric icon is drawn as its left half; the right half is the mirror image."""
    return ["".join(row) + "".join(reversed(row)) for row in half]


# id -> 12 rows of 12 characters (or `sym`: 12 rows of the left 6 characters).
ICONS = {
    # mobility
    "swiftBoots": [
        "............",
        "..OOOO......",
        "..OWbO......",
        "..OWbO......",
        "..OWbO......",
        "..OWBBOOO...",
        "..OWBBBBBO..",
        "..OBBBBBBBO.",
        ".OoooooooooO",
        ".OOOOOOOOOOO",
        "OyO.OyO.OyO.",
        "............",
    ],
    "highJump": [
        ".....OO.....",
        "....OyyO....",
        "...OyyyyO...",
        "..OyyyyyyO..",
        ".OOOOyyOOOO.",
        "....OyyO....",
        "....OyyO....",
        "....OOOO....",
        ".OOOOOOOOOO.",
        ".OWWWWWWWWO.",
        ".OOOOOOOOOO.",
        "............",
    ],
    "aerialistBoots": [
        ".....OO.....",
        "....OTTO....",
        "...OTTTTO...",
        "..OTTOOTTO..",
        ".OTTO..OTTO.",
        "..OO....OO..",
        ".....OO.....",
        "....OTTO....",
        "...OTTTTO...",
        "..OTTOOTTO..",
        ".OTTO..OTTO.",
        "..OO....OO..",
    ],
    # sustain
    "stoneSkin": [
        "............",
        "..OOO..OOO..",
        ".OrrrOOrrrO.",
        "OrwrrrrrrrrO",
        "OrrrrrrrrrrO",
        "OrrrrrrrrrrO",
        ".OrrrrrrrrO.",
        "..OrrrrrrO..",
        "...OrrrrO...",
        "....OrrO....",
        ".....OO.....",
        "............",
    ],
    "ironLungs": [
        "....OWWO....",
        "....OWWO....",
        "..OOOWWOOO..",
        ".OssOWWOssO.",
        "OsyssOOssysO",
        "OsyssOOssysO",
        "OssssOOssssO",
        "OssssOOssssO",
        ".OsssOOsssO.",
        ".OOOO..OOOO.",
        "............",
        "............",
    ],
    "secondWind": [
        "............",
        ".OOOOOOOO...",
        "OTTTTTTTTOO.",
        ".OOOOOOOTTTO",
        "........OOTO",
        "..OOOOOO..O.",
        ".OTTTTTTOO..",
        "..OOOOOOTTO.",
        "........OTO.",
        ".OOOOOO.OO..",
        "OTTTTTTOO...",
        ".OOOOOOO....",
    ],
    # offense
    "sharpEdge": [
        "..........OO",
        ".........OWO",
        "........OWWO",
        ".......OWWO.",
        "......OWWO..",
        ".O...OWWO...",
        ".OO.OWWO....",
        "..OOWWO.....",
        "..OWWO......",
        ".OoOO.......",
        "OoO.O.......",
        ".O..........",
    ],
    "bruteForce": [
        "............",
        "..OOOOOOO...",
        ".OBBBBBBBO..",
        ".OBWWWBBbO..",
        ".OBBBBBBbO..",
        "..OOOoOOO...",
        ".....OoO....",
        ".....OoO....",
        ".....OoO....",
        ".....OoO....",
        ".....OOO....",
        "............",
    ],
    "longReach": [
        ".........OOO",
        "........OWWO",
        ".......OWWO.",
        "......OWO...",
        ".....OoO....",
        "....OoO.....",
        "...OoO......",
        "..OoO.......",
        ".OoO........",
        "OoO.........",
        "OO..........",
        "............",
    ],
    "quickHands": [
        "............",
        "....OOOOO...",
        "OO.OyyyyyO..",
        "..OyyOyOyyO.",
        "OO.OyyyyyyO.",
        "..OyyyyyyyO.",
        "OO.OsyyyyO..",
        "....OsssO...",
        ".....OOO....",
        "............",
        "............",
        "............",
    ],
    "berserkersRage": [
        ".....O......",
        "....OrO..O..",
        "...OrrO.OrO.",
        "..OrrrOOrrO.",
        "..OrryrrrrO.",
        ".OrryyyrrrO.",
        ".OrryyyyrrO.",
        ".OrrryyyrrO.",
        "..OrrryrrO..",
        "...OrrrrO...",
        "....OOOO....",
        "............",
    ],
    "vampiricEdge": [
        ".....OO.....",
        "....OrrO....",
        "...OrrrrO...",
        "..OrrwrrrO..",
        "..OrrrrrrO..",
        "..OrrrrrrO..",
        "...OrrrrO...",
        "....OOOO....",
        "...OwwOwwO..",
        "...OwwOwwO..",
        "....OO.OO...",
        "............",
    ],
    # defense
    "steadyGuard": {
        "sym": [
            "OOOOOO",
            "OBBBBB",
            "OBWWBb",
            "OBWBBb",
            "OBBBBB",
            "OBBBBB",
            ".OBBBB",
            ".OBBBB",
            "..OBBB",
            "...OBB",
            "....OO",
            "......",
        ]
    },
    "bracedStance": [
        "............",
        "..OOOOOOOO..",
        "..ObbbbbbO..",
        "...OBBBBO...",
        "...OBWBBO...",
        "...OBBBBO...",
        "...OBBBBO...",
        "..OBBBBBbO..",
        ".OBBBBBBBbO.",
        ".OOOOOOOOOO.",
        "............",
        "............",
    ],
    "evasiveRoll": [
        "............",
        "....OOOO....",
        "..OOTTTTOO..",
        ".OTTOOOOTTO.",
        ".OTO....OTTO",
        "OTO......OTO",
        "OTO.....OTTO",
        "TTTTO..OTTO.",
        ".OTTOOOTTO..",
        "..OTTTTOO...",
        "...OOOO.....",
        "............",
    ],
    "spikedArmor": [
        "............",
        ".....OO.....",
        ".O...OO...O.",
        "..O.OBBO.O..",
        "...OBWBBO...",
        "OOOOBBBBOOOO",
        "...OBBBBO...",
        "..O.OBBO.O..",
        ".O...OO...O.",
        ".....OO.....",
        "............",
        "............",
    ],
    # epic
    "emberWard": [
        "............",
        "..OOOOOOOO..",
        ".OBBBBBBBBO.",
        ".OBBBrrBBBO.",
        ".OBBrrrrBBO.",
        ".OBBrryrBBO.",
        ".OBBrrryBBO.",
        "..OBBrrBBO..",
        "...OBBBBO...",
        "....OBBO....",
        ".....OO.....",
        "............",
    ],
    "guardianCharm": [
        "....OOOO....",
        "...O....O...",
        "...O....O...",
        "....OOOO....",
        "...OyyyyO...",
        "..OyyTTyyO..",
        "..OyTwTTyO..",
        "..OyTTTTyO..",
        "..OyyTTyyO..",
        "...OyyyyO...",
        "....OOOO....",
        "............",
    ],
}

ORDER = list(ICONS)


def rows_of(icon):
    return mirrored(icon["sym"]) if isinstance(icon, dict) else icon


def main():
    rows_count = (len(ORDER) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (COLS * TILE, rows_count * TILE))
    for i, name in enumerate(ORDER):
        rows = rows_of(ICONS[name])
        assert len(rows) == 12, f"{name}: {len(rows)} rows"
        for y, row in enumerate(rows):
            assert len(row) == 12, f"{name} row {y}: {len(row)} chars {row!r}"
            for x, ch in enumerate(row):
                sheet.putpixel(((i % COLS) * TILE + 2 + x, (i // COLS) * TILE + 2 + y), PALETTE[ch])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, optimize=True)
    print(f"wrote {OUT} ({sheet.width}x{sheet.height}, {len(ORDER)} icons)")
    print("ORDER =", ORDER)


if __name__ == "__main__":
    main()
