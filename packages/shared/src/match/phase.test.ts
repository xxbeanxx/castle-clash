import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_TICKS,
  DRAFT_TICKS,
  ROUND_OVER_TICKS,
  ROUND_TIME_LIMIT,
  ROUNDS_TO_WIN,
} from "../config/game.js";
import { playerId } from "../types/ids.js";
import { advanceMatchPhase, createMatchPhaseState, type MatchPhaseState } from "./phase.js";

const A = playerId("a");
const B = playerId("b");

function tick(
  state: MatchPhaseState,
  input: Partial<{
    tick: number;
    playerCount: number;
    aliveIds: readonly (typeof A)[];
    draftComplete: boolean;
  }> = {},
) {
  return advanceMatchPhase(state, {
    tick: input.tick ?? 0,
    playerCount: input.playerCount ?? 2,
    aliveIds: input.aliveIds ?? [A, B],
    // Every pre-Phase-7 test here doesn't care about draft timing at all —
    // defaulting to `true` reproduces the exact one-tick Draft pass-through
    // those tests already assert (see "moves RoundOver -> Draft ->
    // Countdown" below), so only the new draft-specific tests need to
    // override it.
    draftComplete: input.draftComplete ?? true,
  });
}

describe("advanceMatchPhase", () => {
  it("stays in Waiting until enough players have joined", () => {
    let state = createMatchPhaseState();
    expect(state.phase).toBe("Waiting");

    const result = tick(state, { playerCount: 1 });
    expect(result.state.phase).toBe("Waiting");
    expect(result.events).toEqual([]);
  });

  it("moves Waiting -> Countdown once MIN_PLAYERS is reached", () => {
    const state = createMatchPhaseState();
    const result = tick(state, { playerCount: 2 });
    expect(result.state.phase).toBe("Countdown");
    expect(result.state.ticksInPhase).toBe(0);
  });

  it("aborts Countdown back to Waiting if a player leaves and drops below minimum", () => {
    let state = createMatchPhaseState();
    state = tick(state, { playerCount: 2 }).state;
    expect(state.phase).toBe("Countdown");

    const result = tick(state, { playerCount: 1 });
    expect(result.state.phase).toBe("Waiting");
  });

  it("counts down for COUNTDOWN_TICKS then starts round 1", () => {
    let state = createMatchPhaseState();
    state = tick(state, { playerCount: 2 }).state;

    let result = { state, events: [] as ReturnType<typeof tick>["events"] };
    for (let i = 0; i < COUNTDOWN_TICKS - 1; i++) {
      result = tick(result.state);
      expect(result.state.phase).toBe("Countdown");
    }

    result = tick(result.state);
    expect(result.state.phase).toBe("RoundActive");
    expect(result.state.round).toBe(1);
    expect(result.events).toContainEqual({ type: "roundStart", round: 1 });
  });

  function startRound1(): MatchPhaseState {
    let state = createMatchPhaseState();
    state = tick(state, { playerCount: 2 }).state;
    for (let i = 0; i < COUNTDOWN_TICKS; i++) {
      state = tick(state).state;
    }
    expect(state.phase).toBe("RoundActive");
    return state;
  }

  it("ends the round when only one player is left alive, crediting them a point", () => {
    const state = startRound1();
    const result = tick(state, { aliveIds: [A] });
    expect(result.state.phase).toBe("RoundOver");
    expect(result.state.roundsWon[A]).toBe(1);
    expect(result.events).toContainEqual({ type: "roundEnd", round: 1, winner: A });
  });

  it("resolves a simultaneous (double KO) round as a draw with no points", () => {
    const state = startRound1();
    const result = tick(state, { aliveIds: [] });
    expect(result.state.phase).toBe("RoundOver");
    expect(result.state.roundsWon[A]).toBeUndefined();
    expect(result.state.roundsWon[B]).toBeUndefined();
    expect(result.events).toContainEqual({ type: "roundEnd", round: 1, winner: null });
  });

  it("triggers sudden death once a round runs past the time limit", () => {
    let state = startRound1();
    let sawSuddenDeath = false;
    for (let i = 0; i < ROUND_TIME_LIMIT; i++) {
      const result = tick(state);
      state = result.state;
      if (result.events.some((e) => e.type === "suddenDeath")) {
        sawSuddenDeath = true;
      }
    }
    expect(state.suddenDeath).toBe(true);
    expect(sawSuddenDeath).toBe(true);
    expect(state.phase).toBe("RoundActive");
  });

  it("moves RoundOver -> Draft -> Countdown for the next round", () => {
    let state = startRound1();
    state = tick(state, { aliveIds: [A] }).state;
    expect(state.phase).toBe("RoundOver");

    let lastEvents: ReturnType<typeof tick>["events"] = [];
    for (let i = 0; i < ROUND_OVER_TICKS; i++) {
      const result = tick(state);
      state = result.state;
      lastEvents = result.events;
    }
    expect(state.phase).toBe("Draft");
    expect(lastEvents).toContainEqual({ type: "draftStart", round: 1 });

    state = tick(state).state;
    expect(state.phase).toBe("Countdown");
  });

  it("stays in Draft until draftComplete, even past what a pass-through would take", () => {
    let state = startRound1();
    state = tick(state, { aliveIds: [A] }).state;
    for (let i = 0; i < ROUND_OVER_TICKS; i++) {
      state = tick(state).state;
    }
    expect(state.phase).toBe("Draft");

    for (let i = 0; i < 50; i++) {
      const result = tick(state, { draftComplete: false });
      state = result.state;
      expect(state.phase).toBe("Draft");
    }

    state = tick(state, { draftComplete: true }).state;
    expect(state.phase).toBe("Countdown");
  });

  it("falls back to Countdown after DRAFT_TICKS even if draftComplete never fires", () => {
    let state = startRound1();
    state = tick(state, { aliveIds: [A] }).state;
    for (let i = 0; i < ROUND_OVER_TICKS; i++) {
      state = tick(state).state;
    }
    expect(state.phase).toBe("Draft");

    for (let i = 0; i < DRAFT_TICKS - 1; i++) {
      state = tick(state, { draftComplete: false }).state;
      expect(state.phase).toBe("Draft");
    }
    state = tick(state, { draftComplete: false }).state;
    expect(state.phase).toBe("Countdown");
  });

  it("aborts Draft back to Waiting if players drop below minimum", () => {
    let state = startRound1();
    state = tick(state, { aliveIds: [A] }).state;
    for (let i = 0; i < ROUND_OVER_TICKS; i++) {
      state = tick(state).state;
    }
    expect(state.phase).toBe("Draft");

    const result = tick(state, { draftComplete: false, playerCount: 1 });
    expect(result.state.phase).toBe("Waiting");
  });

  it("ends the match once a player reaches ROUNDS_TO_WIN rounds", () => {
    let state = startRound1();
    for (let round = 1; round <= ROUNDS_TO_WIN; round++) {
      state = tick(state, { aliveIds: [A] }).state;
      expect(state.phase).toBe(round < ROUNDS_TO_WIN ? "RoundOver" : "MatchOver");
      if (state.phase === "MatchOver") {
        break;
      }
      for (let i = 0; i < ROUND_OVER_TICKS; i++) {
        state = tick(state).state;
      }
      state = tick(state).state; // Draft -> Countdown
      for (let i = 0; i < COUNTDOWN_TICKS; i++) {
        state = tick(state).state;
      }
      expect(state.phase).toBe("RoundActive");
    }

    expect(state.phase).toBe("MatchOver");
    expect(state.winner).toBe(A);
    expect(state.roundsWon[A]).toBe(ROUNDS_TO_WIN);
  });

  it("stays in MatchOver once reached", () => {
    let state = startRound1();
    for (let round = 1; round <= ROUNDS_TO_WIN; round++) {
      state = tick(state, { aliveIds: [A] }).state;
      if (state.phase === "MatchOver") {
        break;
      }
      for (let i = 0; i < ROUND_OVER_TICKS; i++) {
        state = tick(state).state;
      }
      state = tick(state).state;
      for (let i = 0; i < COUNTDOWN_TICKS; i++) {
        state = tick(state).state;
      }
    }
    expect(state.phase).toBe("MatchOver");

    const result = tick(state);
    expect(result.state.phase).toBe("MatchOver");
    expect(result.events).toEqual([]);
  });
});

describe("sudden death clock", () => {
  function startRound1(): MatchPhaseState {
    let state = tick(createMatchPhaseState(), { playerCount: 2 }).state;
    for (let i = 0; i < COUNTDOWN_TICKS; i++) {
      state = tick(state).state;
    }
    return state;
  }

  function intoSuddenDeath(): MatchPhaseState {
    let state = startRound1();
    for (let i = 0; i < ROUND_TIME_LIMIT; i++) {
      state = tick(state).state;
    }
    return state;
  }

  it("starts at 1 on the tick sudden death begins and counts up from there", () => {
    let state = startRound1();
    expect(state.suddenDeathTicks).toBe(0);
    for (let i = 0; i < ROUND_TIME_LIMIT - 1; i++) {
      state = tick(state).state;
    }
    expect(state.suddenDeathTicks).toBe(0);
    state = tick(state).state;
    expect(state.suddenDeathTicks).toBe(1);
    state = tick(state).state;
    state = tick(state).state;
    expect(state.suddenDeathTicks).toBe(3);
  });

  it("stops when the round ends, and starts fresh in the next round", () => {
    let state = intoSuddenDeath();
    state = tick(state, { aliveIds: [A] }).state;
    expect(state.phase).toBe("RoundOver");
    expect(state.suddenDeathTicks).toBe(0);

    for (let i = 0; i < ROUND_OVER_TICKS + 1; i++) {
      state = tick(state).state;
    }
    for (let i = 0; i < COUNTDOWN_TICKS + 1; i++) {
      state = tick(state).state;
    }
    expect(state.phase).toBe("RoundActive");
    expect(state.round).toBe(2);
    expect(state.suddenDeathTicks).toBe(0);
  });
});
