import { describe, expect, it } from "vitest";
import { overlaps, penetration } from "./aabb.js";

describe("aabb overlaps", () => {
  it("detects overlap when boxes intersect", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 5, y: 5, w: 10, h: 10 };
    expect(overlaps(a, b)).toBe(true);
  });

  it("does not consider boxes that only touch edges as overlapping", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 10, y: 0, w: 10, h: 10 };
    expect(overlaps(a, b)).toBe(false);
  });

  it("does not detect overlap when boxes are fully separate", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 100, y: 100, w: 10, h: 10 };
    expect(overlaps(a, b)).toBe(false);
  });
});

describe("aabb penetration", () => {
  it("returns null when boxes do not overlap", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 100, y: 100, w: 10, h: 10 };
    expect(penetration(a, b)).toBeNull();
  });

  it("returns the minimum-translation vector along the shallowest axis", () => {
    // a overlaps b by 5 on x (deep) and 10 on y (shallower is x here: 5 < 10)
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 5, y: 0, w: 10, h: 10 };
    expect(penetration(a, b)).toEqual({ x: -5, y: 0 });
  });

  it("picks the vertical axis when it is the shallower overlap", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 0, y: 8, w: 10, h: 10 };
    expect(penetration(a, b)).toEqual({ x: 0, y: -2 });
  });
});
