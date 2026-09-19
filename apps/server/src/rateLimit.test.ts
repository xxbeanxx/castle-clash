import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./rateLimit.js";

describe("FixedWindowRateLimiter", () => {
  it("allows up to the limit within a window", () => {
    const limiter = new FixedWindowRateLimiter(3, 1000);
    expect(limiter.consume("a", 0)).toBe(true);
    expect(limiter.consume("a", 100)).toBe(true);
    expect(limiter.consume("a", 200)).toBe(true);
  });

  it("rejects once the limit is exceeded within the same window", () => {
    const limiter = new FixedWindowRateLimiter(2, 1000);
    expect(limiter.consume("a", 0)).toBe(true);
    expect(limiter.consume("a", 100)).toBe(true);
    expect(limiter.consume("a", 200)).toBe(false);
  });

  it("resets once the window elapses", () => {
    const limiter = new FixedWindowRateLimiter(1, 1000);
    expect(limiter.consume("a", 0)).toBe(true);
    expect(limiter.consume("a", 500)).toBe(false);
    expect(limiter.consume("a", 1000)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = new FixedWindowRateLimiter(1, 1000);
    expect(limiter.consume("a", 0)).toBe(true);
    expect(limiter.consume("b", 0)).toBe(true);
    expect(limiter.consume("a", 0)).toBe(false);
    expect(limiter.consume("b", 0)).toBe(false);
  });

  it("forgets a key once deleted", () => {
    const limiter = new FixedWindowRateLimiter(1, 1000);
    expect(limiter.consume("a", 0)).toBe(true);
    limiter.delete("a");
    expect(limiter.consume("a", 0)).toBe(true);
  });
});
