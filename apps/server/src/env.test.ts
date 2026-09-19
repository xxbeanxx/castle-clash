import { afterEach, describe, expect, it, vi } from "vitest";
import { envNumber } from "./env.js";

describe("envNumber", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the fallback when unset or empty", () => {
    expect(envNumber("CC_TEST_UNSET", 7)).toBe(7);
    vi.stubEnv("CC_TEST_EMPTY", "");
    expect(envNumber("CC_TEST_EMPTY", 7)).toBe(7);
  });

  it("parses a numeric value", () => {
    vi.stubEnv("CC_TEST_NUM", "42");
    expect(envNumber("CC_TEST_NUM", 7)).toBe(42);
  });

  it("falls back on an unparseable value instead of returning NaN", () => {
    vi.stubEnv("CC_TEST_BAD", "abc");
    expect(envNumber("CC_TEST_BAD", 7)).toBe(7);
  });
});
