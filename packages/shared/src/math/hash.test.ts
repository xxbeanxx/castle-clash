import { describe, expect, it } from "vitest";
import { fnv1a } from "./hash.js";

describe("fnv1a", () => {
  it("is deterministic for the same input", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
  });

  it("differs for different input", () => {
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });

  it("returns an unsigned 32-bit integer", () => {
    const hash = fnv1a("castle-clash");
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });
});
