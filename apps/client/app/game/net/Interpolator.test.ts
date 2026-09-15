import { describe, expect, it } from "vitest";
import { Interpolator } from "./Interpolator.js";

describe("client Interpolator", () => {
  it("decodes synthetic {x,y} snapshots and interpolates between them", () => {
    const interpolator = new Interpolator({ delayMs: 100 });
    interpolator.pushFromSchema({ x: 0, y: 0 }, 0);
    interpolator.pushFromSchema({ x: 100, y: 0 }, 100);

    expect(interpolator.positionAt(150)).toEqual({ x: 50, y: 0 });
  });

  it("holds the last snapshot instead of extrapolating", () => {
    const interpolator = new Interpolator({ delayMs: 0 });
    interpolator.pushFromSchema({ x: 0, y: 0 }, 0);
    interpolator.pushFromSchema({ x: 100, y: 0 }, 100);

    expect(interpolator.positionAt(1000)).toEqual({ x: 100, y: 0 });
  });

  it("returns undefined before any snapshot arrives", () => {
    const interpolator = new Interpolator();
    expect(interpolator.positionAt(0)).toBeUndefined();
  });
});
