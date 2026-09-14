import { TICK_RATE } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";

describe("workspace resolution", () => {
  it("resolves @castle-clash/shared from apps/server", () => {
    expect(TICK_RATE).toBe(60);
  });
});
