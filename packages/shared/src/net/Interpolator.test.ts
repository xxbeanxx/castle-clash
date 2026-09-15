import { describe, expect, it } from "vitest";
import { Interpolator } from "./Interpolator.js";

describe("Interpolator", () => {
  it("renders at serverTime - delayMs by lerping between bracketing snapshots", () => {
    const interp = new Interpolator({ delayMs: 100 });
    interp.push({ serverTime: 0, pos: { x: 0, y: 0 } });
    interp.push({ serverTime: 100, pos: { x: 100, y: 0 } });

    // render time = 150 - 100 = 50 -> halfway between the two snapshots
    expect(interp.positionAt(150)).toEqual({ x: 50, y: 0 });
  });

  it("holds the last known value when the buffer runs dry ahead of render time", () => {
    const interp = new Interpolator({ delayMs: 100 });
    interp.push({ serverTime: 0, pos: { x: 0, y: 0 } });
    interp.push({ serverTime: 100, pos: { x: 100, y: 0 } });

    // render time = 400 - 100 = 300, past the newest snapshot: hold it, don't extrapolate.
    expect(interp.positionAt(400)).toEqual({ x: 100, y: 0 });
  });

  it("never extrapolates past the newest snapshot even with a clear velocity trend", () => {
    const interp = new Interpolator({ delayMs: 0 });
    interp.push({ serverTime: 0, pos: { x: 0, y: 0 } });
    interp.push({ serverTime: 100, pos: { x: 100, y: 0 } });

    expect(interp.positionAt(1000)).toEqual({ x: 100, y: 0 });
  });

  it("returns undefined before any snapshot has arrived", () => {
    const interp = new Interpolator();
    expect(interp.positionAt(0)).toBeUndefined();
  });

  it("caps the snapshot buffer, dropping the oldest first", () => {
    const interp = new Interpolator({ delayMs: 0, bufferSize: 2 });
    interp.push({ serverTime: 0, pos: { x: 0, y: 0 } });
    interp.push({ serverTime: 100, pos: { x: 100, y: 0 } });
    interp.push({ serverTime: 200, pos: { x: 200, y: 0 } });

    // the serverTime:0 snapshot should have been dropped
    expect(interp.positionAt(100)).toEqual({ x: 100, y: 0 });
  });
});
