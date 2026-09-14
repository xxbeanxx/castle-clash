import { describe, expect, it } from "vitest";
import { add, length, scale, sub } from "./vec.js";

describe("vec", () => {
  it("adds two vectors component-wise", () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
  });

  it("subtracts two vectors component-wise", () => {
    expect(sub({ x: 5, y: 7 }, { x: 2, y: 3 })).toEqual({ x: 3, y: 4 });
  });

  it("scales a vector by a scalar", () => {
    expect(scale({ x: 2, y: -3 }, 2)).toEqual({ x: 4, y: -6 });
  });

  it("computes the length of a vector via the 3-4-5 triangle", () => {
    expect(length({ x: 3, y: 4 })).toBe(5);
  });
});
