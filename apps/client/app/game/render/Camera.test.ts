import { describe, expect, it } from "vitest";
import { type CameraConfig, DEFAULT_CAMERA_CONFIG, frameCamera } from "./Camera.js";

const BOUNDS = { x: 0, y: 0, w: 4000, h: 2000 };
const CONFIG: CameraConfig = {
  viewportWidth: 1280,
  viewportHeight: 720,
  minZoom: 0.5,
  maxZoom: 1,
  padding: 160,
};

describe("frameCamera", () => {
  it("centers on the sole living player, zoomed to maxZoom", () => {
    const frame = frameCamera([{ x: 2000, y: 1000 }], BOUNDS, CONFIG);
    expect(frame.x).toBe(2000);
    expect(frame.y).toBe(1000);
    expect(frame.zoom).toBe(CONFIG.maxZoom);
  });

  it("gives the clamp minimum zoom for two players at opposite arena extremes", () => {
    const frame = frameCamera(
      [
        { x: BOUNDS.x + 100, y: BOUNDS.y + 100 },
        { x: BOUNDS.x + BOUNDS.w - 100, y: BOUNDS.y + BOUNDS.h - 100 },
      ],
      BOUNDS,
      CONFIG,
    );
    expect(frame.zoom).toBe(CONFIG.minZoom);
  });

  it("centers between two nearby players at maxZoom, when their span plus padding still fits", () => {
    const frame = frameCamera(
      [
        { x: 1900, y: 1000 },
        { x: 2100, y: 1000 },
      ],
      BOUNDS,
      CONFIG,
    );
    expect(frame.x).toBe(2000);
    expect(frame.y).toBe(1000);
    expect(frame.zoom).toBe(CONFIG.maxZoom);
  });

  it("clamps the frame to stay within arena bounds near an edge", () => {
    const frame = frameCamera([{ x: 10, y: 10 }], BOUNDS, CONFIG);
    const halfViewW = CONFIG.viewportWidth / frame.zoom / 2;
    const halfViewH = CONFIG.viewportHeight / frame.zoom / 2;
    expect(frame.x).toBeGreaterThanOrEqual(BOUNDS.x + halfViewW - 1e-9);
    expect(frame.y).toBeGreaterThanOrEqual(BOUNDS.y + halfViewH - 1e-9);
  });

  it("centers on the arena when nobody is alive", () => {
    const frame = frameCamera([], BOUNDS, CONFIG);
    expect(frame.x).toBe(BOUNDS.x + BOUNDS.w / 2);
    expect(frame.y).toBe(BOUNDS.y + BOUNDS.h / 2);
    expect(frame.zoom).toBe(CONFIG.maxZoom);
  });

  it("centers the frame on a viewport-smaller-than-arena axis instead of pinning to one edge", () => {
    const tinyBounds = { x: 0, y: 0, w: 100, h: 100 };
    const frame = frameCamera([{ x: 10, y: 10 }], tinyBounds, DEFAULT_CAMERA_CONFIG);
    expect(frame.x).toBe(50);
    expect(frame.y).toBe(50);
  });
});
