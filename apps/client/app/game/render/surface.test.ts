import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ART_H, ART_W, computeSurface, MAX_DPR, placeArena } from "./surface.js";

function layout(cssW: number, cssH: number, dpr: number) {
  const result = computeSurface(cssW, cssH, dpr);
  if (!result) {
    throw new Error("expected a layout");
  }
  return result;
}

describe("computeSurface", () => {
  // The spike's table (ADR 0002). Scale is physical pixels per art pixel.
  it.each([
    ["iPhone SE landscape", 667, 375, 2, 2],
    ["iPhone 14 landscape", 844, 390, 3, 3],
    ["iPhone 14 Pro Max landscape", 932, 430, 3, 3],
    ["Pixel 7 landscape (fractional DPR)", 915, 412, 2.625, 3],
    ["small Android 800x360", 800, 360, 2, 2],
    ["iPad landscape (width and height both bind)", 1024, 768, 2, 3],
    ["laptop 1440x900 Retina", 1440, 900, 2, 4],
    ["laptop 1366x768", 1366, 768, 1, 2],
    ["desktop 1080p", 1920, 1080, 1, 3],
    ["desktop 1440p", 2560, 1440, 1, 4],
    ["ultrawide 3440x1440", 3440, 1440, 1, 4],
    ["4K", 3840, 2160, 1, 6],
    ["1280x720 window", 1280, 720, 1, 2],
  ])("%s -> %ix scale", (_name, cssW, cssH, dpr, scale) => {
    const result = layout(cssW, cssH, dpr);
    expect(result.scale).toBe(scale);
    expect(result.fractional).toBe(false);
  });

  it("uses floor of the physical size, so Pixel 7's 1081.5 rows still reach 3x", () => {
    expect(layout(915, 412, 2.625).physH).toBe(1081);
  });

  it("drops a step when the browser reports one row short of the threshold", () => {
    expect(layout(640, 359.9, 3).scale).toBe(2);
    expect(layout(640, 360, 3).scale).toBe(3);
  });

  it("falls back to a fractional scale only below 640x360 physical pixels", () => {
    const result = layout(320, 180, 1);
    expect(result.fractional).toBe(true);
    expect(result.scale).toBe(0.5);
    expect(result.viewW).toBe(ART_W);
  });

  it("caps DPR at MAX_DPR", () => {
    expect(layout(1000, 500, 5).physW).toBe(1000 * MAX_DPR);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("treats DPR %s as 1", (dpr) => {
    expect(layout(1280, 720, dpr).physW).toBe(1280);
  });

  it.each([
    [0, 720],
    [1280, 0],
    [0, 0],
    [0.4, 0.4],
    [Number.NaN, 720],
  ])("returns null for a %s x %s container", (w, h) => {
    expect(computeSurface(w, h, 2)).toBeNull();
  });

  it("property: the 640x360 arena always fits, the scale is whole unless fractional, and the last step is used", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 5000 }),
        fc.integer({ min: 180, max: 3000 }),
        fc.double({ min: 1, max: 4, noNaN: true }),
        (cssW, cssH, dpr) => {
          const result = computeSurface(cssW, cssH, dpr);
          if (!result) return false;
          const { scale, physW, physH } = result;
          const fits = ART_W * scale <= physW + 1e-9 && ART_H * scale <= physH + 1e-9;
          const whole = result.fractional || Number.isInteger(scale);
          // One more whole step would not fit (otherwise the largest step was not chosen).
          const maximal =
            result.fractional || ART_W * (scale + 1) > physW || ART_H * (scale + 1) > physH;
          const covers =
            result.viewW * scale >= physW - 1e-9 && result.viewH * scale >= physH - 1e-9;
          return fits && whole && maximal && covers;
        },
      ),
    );
  });
});

describe("placeArena", () => {
  const ARENA = { x: 0, y: 0, w: 1280, h: 720 };

  it("puts a 16:9 arena at the origin when the view is exactly 640x360", () => {
    const t = placeArena(layout(1280, 720, 1), ARENA);
    expect(t).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("centers a 20:9 phone's overscan equally left and right", () => {
    const l = layout(844, 390, 3); // 2532x1170 physical, 3x: 844x390 art px
    const t = placeArena(l, ARENA);
    expect(t.scale).toBe(1.5);
    expect(t.x).toBe(102 * 3); // (844 - 640) / 2 art px
    expect(t.y).toBe(15 * 3); // (390 - 360) / 2 art px
  });

  it("centers the shorter Dungeon vertically", () => {
    const t = placeArena(layout(1280, 720, 1), { x: 0, y: 0, w: 1280, h: 420 });
    expect(t.y).toBe(75 * 2); // (360 - 210) / 2 art px at 2x
  });

  it("keeps the offset a whole multiple of the scale", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 640, max: 4000 }),
        fc.integer({ min: 360, max: 2200 }),
        fc.integer({ min: -7, max: 7 }),
        (cssW, cssH, shake) => {
          const l = layout(cssW, cssH, 1);
          const t = placeArena(l, ARENA, { x: shake, y: -shake });
          return Number.isInteger(t.x / l.scale) && Number.isInteger(t.y / l.scale);
        },
      ),
    );
  });

  it("shifts by whole art pixels for a shake", () => {
    const l = layout(1280, 720, 1);
    const base = placeArena(l, ARENA);
    const shaken = placeArena(l, ARENA, { x: 3, y: -2 });
    expect(shaken.x - base.x).toBe(3 * l.scale);
    expect(shaken.y - base.y).toBe(-2 * l.scale);
  });
});
