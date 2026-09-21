import { blit, createRaster, setPixel, type Raster, type Rgb } from "./raster.js";

/**
 * A 3x5 pixel font for the in-canvas name plates. Player names sit above a knight that is 24 art
 * pixels tall, so the text has to be a handful of art pixels: a browser font at that size would blur
 * (or need a font-size no integer scale lands on), while these glyphs are exact pixels at any scale.
 * Uppercase, digits and a little punctuation; anything else draws as `?`. The DOM HUD still shows
 * the full, properly typeset name.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101110011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001110",
  "-": "000000111000000",
  ".": "000000000000010",
  _: "000000000000111",
  " ": "000000000000000",
  "?": "110001010000010",
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;
const SPACING = 1;

export function hasGlyph(char: string): boolean {
  return char.toUpperCase() in GLYPHS;
}

/** Width in pixels of `text` (no outline). */
export function measureText(text: string): number {
  return text.length === 0 ? 0 : text.length * (GLYPH_W + SPACING) - SPACING;
}

/**
 * `text` in `color` with a 1 px `outline` all round, on a transparent raster (so the plate reads
 * against any background). The raster is `measureText(text) + 2` by `GLYPH_H + 2`.
 */
export function renderText(text: string, color: Rgb, outline: Rgb): Raster {
  const target = createRaster(Math.max(1, measureText(text)) + 2, GLYPH_H + 2);
  const ink = createRaster(target.w, target.h);
  [...text].forEach((char, index) => {
    const glyph = GLYPHS[char.toUpperCase()] ?? GLYPHS["?"]!;
    for (let i = 0; i < glyph.length; i++) {
      if (glyph[i] === "1") {
        setPixel(
          ink,
          1 + index * (GLYPH_W + SPACING) + (i % GLYPH_W),
          1 + Math.floor(i / GLYPH_W),
          color,
        );
      }
    }
  });
  // The outline is the ink stamped one pixel off in the eight directions, under the ink itself.
  const mask = createRaster(ink.w, ink.h);
  for (let i = 0; i < ink.w * ink.h; i++) {
    if ((ink.data[i * 4 + 3] ?? 0) === 255) {
      mask.data.set([outline[0], outline[1], outline[2], 255], i * 4);
    }
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0) {
        blit(target, mask, dx, dy);
      }
    }
  }
  blit(target, ink, 0, 0);
  return target;
}
