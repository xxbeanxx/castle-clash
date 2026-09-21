// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OUTLINE } from "./arenaRaster.js";
import {
  MAX_PLATE_CHARS,
  plateText,
  renderGroundMarker,
  renderNamePlate,
  renderYouArrow,
} from "./markers.js";
import { GLYPH_H, GLYPH_W, hasGlyph, measureText, renderText } from "./pixelText.js";
import { pixelAt } from "./raster.js";

const WHITE = [255, 255, 255] as const;

describe("pixel font", () => {
  it("has a 3x5 glyph for every letter, digit and the punctuation names use", () => {
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._ ") {
      expect(hasGlyph(ch), ch).toBe(true);
    }
    expect(hasGlyph("!")).toBe(false);
  });

  it("measures 3 px per character and 1 px between", () => {
    expect(measureText("")).toBe(0);
    expect(measureText("A")).toBe(GLYPH_W);
    expect(measureText("ABC")).toBe(3 * GLYPH_W + 2);
  });

  it("draws text in its colour with a 1 px outline all round, and nothing else opaque", () => {
    const image = renderText("I", WHITE, OUTLINE);
    expect([image.w, image.h]).toEqual([GLYPH_W + 2, GLYPH_H + 2]);
    // "I" is a full top row, a stem and a full bottom row.
    expect(pixelAt(image, 1, 1).slice(0, 3)).toEqual([...WHITE]);
    expect(pixelAt(image, 2, 3).slice(0, 3)).toEqual([...WHITE]);
    expect(pixelAt(image, 0, 0).slice(0, 3)).toEqual([...OUTLINE]);
    // The pixel beside the stem, between the serifs, is outline, and so is the corner past the last serif.
    expect(pixelAt(image, 1, 3).slice(0, 3)).toEqual([...OUTLINE]);
    expect(pixelAt(image, image.w - 1, image.h - 1)[3]).toBe(255);
  });

  it("folds case and draws an unknown character as ?", () => {
    expect(renderText("a", WHITE, OUTLINE).data).toEqual(renderText("A", WHITE, OUTLINE).data);
    expect(renderText("!", WHITE, OUTLINE).data).toEqual(renderText("?", WHITE, OUTLINE).data);
  });

  it("gives every letter a different picture", () => {
    const seen = new Set<string>();
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") {
      seen.add(renderText(ch, WHITE, OUTLINE).data.join());
    }
    expect(seen.size).toBe(36);
  });
});

describe("markers", () => {
  it("cuts a long name to fit and marks the cut", () => {
    expect(plateText("Sir Aldric")).toBe("Sir Aldric");
    const cut = plateText("Guest-ABCD-EFGH");
    expect(cut).toHaveLength(MAX_PLATE_CHARS);
    expect(cut.endsWith(".")).toBe(true);
    expect(plateText("  Bo  ")).toBe("Bo");
  });

  it("draws a name plate as wide as its text, in a colour bright enough to read on the dark scene", () => {
    const plate = renderNamePlate("Bo", 0x000000);
    expect(plate.w).toBe(measureText("Bo") + 2);
    const ink = pixelAt(plate, 1, 1); // the top-left pixel of "B"
    expect(ink[0]).toBeGreaterThan(100); // near-black is normalised to a grey
  });

  it("makes the local player's ground marker longer and lit in the middle", () => {
    const others = renderGroundMarker(0x3a6fe0, false);
    const me = renderGroundMarker(0x3a6fe0, true);
    expect(me.w).toBeGreaterThan(others.w);
    expect(pixelAt(me, Math.floor(me.w / 2), 1).slice(0, 3)).toEqual([255, 255, 255]);
    expect(pixelAt(others, Math.floor(others.w / 2), 1).slice(0, 3)).not.toEqual([255, 255, 255]);
  });

  it("draws the you-arrow pointing down: widest at the top, one pixel at the bottom", () => {
    const arrow = renderYouArrow(0x3a6fe0);
    const opaque = (y: number) =>
      [...Array(arrow.w).keys()].filter((x) => pixelAt(arrow, x, y)[3] === 255).length;
    expect(opaque(0)).toBeGreaterThan(opaque(arrow.h - 1));
    expect(opaque(arrow.h - 1)).toBe(1);
  });
});
