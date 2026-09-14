import { describe, expect, it } from "vitest";
import { MAX_PLAYERS, PATCH_RATE, ROUNDS_TO_WIN, TICK_RATE } from "./game.js";

describe("game config invariants", () => {
  it("keeps TICK_RATE an exact multiple of PATCH_RATE", () => {
    expect(TICK_RATE % PATCH_RATE).toBe(0);
  });

  it("allows at least 2 players per match", () => {
    expect(MAX_PLAYERS).toBeGreaterThanOrEqual(2);
  });

  it("requires at least 1 round to win", () => {
    expect(ROUNDS_TO_WIN).toBeGreaterThanOrEqual(1);
  });
});
