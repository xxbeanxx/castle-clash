import { describe, expect, it } from "vitest";
import { FrameStats } from "./FrameStats.js";

describe("FrameStats", () => {
  it("has no summary before any frame", () => {
    expect(new FrameStats().summary()).toBeNull();
  });

  it("summarises mean, p95, max and slow frames", () => {
    const stats = new FrameStats(100, 16);
    for (let i = 0; i < 95; i += 1) stats.record(16);
    for (let i = 0; i < 5; i += 1) stats.record(50);
    const summary = stats.summary()!;
    expect(summary.frames).toBe(100);
    expect(summary.maxMs).toBe(50);
    expect(summary.p95Ms).toBe(16);
    expect(summary.slowFrames).toBe(5);
    expect(summary.meanMs).toBeCloseTo((95 * 16 + 5 * 50) / 100, 9);
  });

  it("keeps only the newest window", () => {
    const stats = new FrameStats(3, 16);
    [100, 1, 2, 3].forEach((ms) => stats.record(ms));
    expect(stats.summary()).toMatchObject({ frames: 3, maxMs: 3 });
  });

  it("ignores junk", () => {
    const stats = new FrameStats();
    stats.record(Number.NaN);
    stats.record(-1);
    expect(stats.summary()).toBeNull();
  });
});
