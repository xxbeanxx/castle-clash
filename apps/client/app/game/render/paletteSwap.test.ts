import { describe, expect, it } from "vitest";
import {
  applyPaletteSwap,
  CLOTH_GARMENT,
  CLOTH_SCARF,
  CLOTH_SCARF_SHADE,
  playerSwap,
  vivid,
} from "./paletteSwap.js";

function pixel(rgb: number, a = 255): number[] {
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, a];
}

const STEEL = 0xc7c7b0;
const OUTLINE = 0x1a0e13;

describe("playerSwap", () => {
  it("replaces only the three cloth colours", () => {
    const data = new Uint8ClampedArray([
      ...pixel(CLOTH_SCARF),
      ...pixel(CLOTH_SCARF_SHADE),
      ...pixel(CLOTH_GARMENT),
      ...pixel(STEEL),
      ...pixel(OUTLINE),
    ]);
    applyPaletteSwap(data, playerSwap(0x3a6fe0));
    const out = Array.from({ length: 5 }, (_, i) => Array.from(data.slice(i * 4, i * 4 + 4)));
    // cloth changed, steel and outline untouched, alpha untouched
    for (const px of out.slice(0, 3)) {
      expect(px[2]).toBeGreaterThan(px[0] ?? 0);
      expect(px[3]).toBe(255);
    }
    expect(out[3]).toEqual(pixel(STEEL));
    expect(out[4]).toEqual(pixel(OUTLINE));
  });

  it("leaves transparent pixels alone even if their rgb matches", () => {
    const data = new Uint8ClampedArray(pixel(CLOTH_SCARF, 0));
    applyPaletteSwap(data, playerSwap(0xff0000));
    expect(Array.from(data)).toEqual(pixel(CLOTH_SCARF, 0));
  });

  it("gives the two cloth shades a darker ramp than the base colour", () => {
    const swap = playerSwap(0x40c040);
    const lum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    expect(lum(swap.get(CLOTH_SCARF) ?? 0)).toBeGreaterThan(lum(swap.get(CLOTH_SCARF_SHADE) ?? 0));
    expect(lum(swap.get(CLOTH_SCARF_SHADE) ?? 0)).toBeGreaterThan(
      lum(swap.get(CLOTH_GARMENT) ?? 0),
    );
  });
});

describe("vivid", () => {
  it("normalises the brightest channel and keeps the hue", () => {
    expect(vivid(0x000064)).toBe(0x0000dc);
    expect(vivid(0xffffff)).toBe(0xdcdcdc);
  });

  it("turns black into a grey instead of staying invisible", () => {
    expect(vivid(0x000000)).toBe(0x808080);
  });
});
