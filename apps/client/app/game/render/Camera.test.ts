import { describe, expect, it } from "vitest";
import { Camera } from "./Camera.js";
import { computeSurface, placeArena } from "./surface.js";

const ARENA = { x: 0, y: 0, w: 1280, h: 720 };
const LAYOUT = computeSurface(1280, 720, 1)!;

describe("Camera", () => {
  it("is exactly the centered placement while not shaking", () => {
    expect(new Camera(ARENA).transform(LAYOUT)).toEqual(placeArena(LAYOUT, ARENA));
  });

  it("shakes in whole art pixels", () => {
    const camera = new Camera(ARENA, () => 0.9);
    camera.shake(1);
    const t = camera.transform(LAYOUT);
    const base = placeArena(LAYOUT, ARENA);
    expect(Number.isInteger((t.x - base.x) / LAYOUT.scale)).toBe(true);
    expect(t.x).not.toBe(base.x);
  });

  it("decays to a standstill", () => {
    const camera = new Camera(ARENA, () => 1);
    camera.shake(1);
    for (let i = 0; i < 60; i += 1) {
      camera.update(1 / 60);
    }
    expect(camera.transform(LAYOUT)).toEqual(placeArena(LAYOUT, ARENA));
  });

  it("keeps the harder of two impulses", () => {
    const camera = new Camera(ARENA, () => 1);
    camera.shake(1);
    camera.shake(0.2);
    camera.update(0.05);
    // 1 - 8 * 0.05 = 0.6 remaining, not 0.2 - 0.4 (already spent).
    expect(camera.transform(LAYOUT).x).not.toBe(placeArena(LAYOUT, ARENA).x);
  });
});
