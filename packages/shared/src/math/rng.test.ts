import { describe, expect, it } from "vitest";
import { hashSeed, mulberry32 } from "./rng.js";

describe("mulberry32", () => {
  it("produces the same 1000-value sequence for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 1000 }, () => a());
    const seqB = Array.from({ length: 1000 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("diverges for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("returns values in [0, 1) with a roughly uniform bucket distribution", () => {
    const rng = mulberry32(42);
    const buckets = new Array(10).fill(0);
    const samples = 10_000;
    for (let i = 0; i < samples; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
    }
    const expectedPerBucket = samples / 10;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(expectedPerBucket * 0.8);
      expect(count).toBeLessThan(expectedPerBucket * 1.2);
    }
  });
});

describe("hashSeed", () => {
  it("is deterministic for the same parts", () => {
    expect(hashSeed("match-1", 3, "player-a")).toBe(hashSeed("match-1", 3, "player-a"));
  });

  it("differs when any part differs", () => {
    const base = hashSeed("match-1", 3, "player-a");
    expect(hashSeed("match-1", 4, "player-a")).not.toBe(base);
    expect(hashSeed("match-1", 3, "player-b")).not.toBe(base);
    expect(hashSeed("match-2", 3, "player-a")).not.toBe(base);
  });
});
