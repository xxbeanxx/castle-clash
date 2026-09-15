import { MatchState } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { matchStateToPhaseBanner } from "./matchFlow.js";

describe("matchStateToPhaseBanner", () => {
  it("maps phase and round directly", () => {
    const state = new MatchState();
    state.phase = "RoundActive";
    state.round = 2;
    state.phaseEndsAtTick = -1;

    expect(matchStateToPhaseBanner(state)).toEqual({
      phase: "RoundActive",
      round: 2,
      ticksRemaining: null,
    });
  });

  it("computes ticksRemaining from phaseEndsAtTick and tick", () => {
    const state = new MatchState();
    state.phase = "Countdown";
    state.tick = 100;
    state.phaseEndsAtTick = 280;

    expect(matchStateToPhaseBanner(state).ticksRemaining).toBe(180);
  });

  it("clamps ticksRemaining to 0 rather than going negative", () => {
    const state = new MatchState();
    state.tick = 300;
    state.phaseEndsAtTick = 280;

    expect(matchStateToPhaseBanner(state).ticksRemaining).toBe(0);
  });
});
