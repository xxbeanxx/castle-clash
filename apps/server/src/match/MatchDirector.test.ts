import {
  COUNTDOWN_TICKS,
  createHazardState,
  createSimPlayer,
  getArena,
  MAX_HP,
  playerId,
  ROUND_OVER_TICKS,
  ROUND_TIME_LIMIT,
  ROUNDS_TO_WIN,
  step,
  TESTBED_ARENA,
  type PlayerId,
  type SimState,
} from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { MatchDirector } from "./MatchDirector.js";

const A = playerId("a");
const B = playerId("b");
const CONNECTED: readonly PlayerId[] = [A, B];

function initialState(): SimState {
  return {
    tick: 0,
    players: {
      [A]: createSimPlayer(TESTBED_ARENA.spawns[0]!),
      [B]: createSimPlayer(TESTBED_ARENA.spawns[1]!),
    },
    arena: TESTBED_ARENA,
    rngSeed: 1,
  };
}

/** Drives `director`/`sim` for `count` ticks with no input, returning the
 *  resulting sim state. */
function runTicks(director: MatchDirector, sim: SimState, count: number): SimState {
  for (let i = 0; i < count; i++) {
    const result = step(sim, {});
    sim = director.tick(sim, result.state, result.events, CONNECTED).state;
  }
  return sim;
}

/** Waiting -> Countdown -> RoundActive, round 1. */
function startMatch(director: MatchDirector): SimState {
  director.addPlayer(A);
  director.addPlayer(B);
  const sim = runTicks(director, initialState(), COUNTDOWN_TICKS + 1);
  expect(director.phase.phase).toBe("RoundActive");
  expect(director.phase.round).toBe(1);
  return sim;
}

/** Drops `victim` into the testbed arena's kill zone for one tick, returning
 *  that tick's `MatchDirectorTickResult`. */
function killByFalling(director: MatchDirector, sim: SimState, victim: PlayerId) {
  const dropped: SimState = {
    ...sim,
    players: { ...sim.players, [victim]: { ...sim.players[victim]!, pos: { x: 0, y: 1000 } } },
  };
  const result = step(dropped, {});
  return {
    tickResult: director.tick(dropped, result.state, result.events, CONNECTED),
    nextSim: result.state,
  };
}

/** RoundOver -> Draft -> Countdown -> RoundActive for the next round. */
function playThroughToNextRound(director: MatchDirector, sim: SimState): SimState {
  return runTicks(director, sim, ROUND_OVER_TICKS + 1 + COUNTDOWN_TICKS);
}

describe("MatchDirector", () => {
  it("runs a scripted 3-round match and produces the expected MatchResult", () => {
    const director = new MatchDirector();
    let sim = startMatch(director);

    for (let round = 1; round <= ROUNDS_TO_WIN; round++) {
      sim = {
        ...sim,
        players: {
          ...sim.players,
          [B]: { ...sim.players[B]!, lastHitBy: A, lastHitTick: sim.tick },
        },
      };
      const { tickResult, nextSim } = killByFalling(director, sim, B);
      sim = tickResult.state;
      expect(director.phase.roundsWon[A]).toBe(round);

      if (round < ROUNDS_TO_WIN) {
        expect(director.phase.phase).toBe("RoundOver");
        expect(tickResult.result).toBeNull();
        sim = playThroughToNextRound(director, sim);
        expect(director.phase.phase).toBe("RoundActive");
        expect(director.phase.round).toBe(round + 1);
        expect(sim.players[A]!.hp).toBe(MAX_HP);
        expect(sim.players[B]!.hp).toBe(MAX_HP);
      } else {
        expect(director.phase.phase).toBe("MatchOver");
        expect(tickResult.result).not.toBeNull();
        const result = tickResult.result!;
        expect(result.winner).toBe(A);
        expect(result.rounds).toBe(ROUNDS_TO_WIN);
        expect(result.stats[A]!.eliminations).toBe(ROUNDS_TO_WIN);
        expect(result.stats[A]!.roundsWon).toBe(ROUNDS_TO_WIN);
        expect(result.stats[B]!.deaths).toBe(ROUNDS_TO_WIN);
      }
      void nextSim;
    }
  });

  it("resolves a simultaneous double KO as a draw round with no eliminations credited", () => {
    const director = new MatchDirector();
    let sim = startMatch(director);

    const dropped: SimState = {
      ...sim,
      players: {
        [A]: { ...sim.players[A]!, pos: { x: 0, y: 1000 } },
        [B]: { ...sim.players[B]!, pos: { x: 0, y: 1000 } },
      },
    };
    const result = step(dropped, {});
    const tickResult = director.tick(dropped, result.state, result.events, CONNECTED);
    sim = tickResult.state;

    expect(director.phase.phase).toBe("RoundOver");
    expect(director.phase.roundsWon[A]).toBeUndefined();
    expect(director.phase.roundsWon[B]).toBeUndefined();
  });

  it("credits a ring-out to the last attacker within the ring-out window", () => {
    const director = new MatchDirector();
    let sim = startMatch(director);

    sim = {
      ...sim,
      players: { ...sim.players, [B]: { ...sim.players[B]!, lastHitBy: A, lastHitTick: sim.tick } },
    };
    const { tickResult } = killByFalling(director, sim, B);

    expect(director.phase.roundsWon[A]).toBe(1);
    // The credit came from the fall's "eliminated" event (by: A), not a
    // separate hit this tick — eliminations should reflect it either way.
    expect(tickResult.phase.roundsWon[A]).toBe(1);
  });

  it("marks a disconnect during RoundActive as an elimination without dropping the seat", () => {
    const director = new MatchDirector();
    const sim = startMatch(director);

    expect(director.isAlive(B)).toBe(true);
    director.eliminateByDisconnect(B, sim, sim.tick);
    expect(director.isAlive(B)).toBe(false);

    // The round ends on the next tick, since only A is left alive.
    const result = step(sim, {});
    const tickResult = director.tick(sim, result.state, result.events, CONNECTED);
    expect(tickResult.phase.phase).toBe("RoundOver");
    expect(tickResult.phase.roundsWon[A]).toBe(1);
  });

  it("resets a broken BreakableFloor's hazard state when the next round starts (plan Phase 6 step 4)", () => {
    const arena = getArena("woodenHall");
    const director = new MatchDirector();
    director.addPlayer(A);
    director.addPlayer(B);

    let sim: SimState = {
      tick: 0,
      players: { [A]: createSimPlayer(arena.spawns[0]!), [B]: createSimPlayer(arena.spawns[1]!) },
      arena,
      rngSeed: 1,
      hazards: createHazardState(arena.hazards),
    };
    sim = runTicks(director, sim, COUNTDOWN_TICKS + 1);
    expect(director.phase.phase).toBe("RoundActive");
    expect(director.phase.round).toBe(1);

    // A heavy attack (or a landing, for `breakOn: "landing"`) broke the
    // floor sometime during round 1 — `hazards/breakableFloor.test.ts`
    // already covers exactly how; this test only cares what happens to
    // that broken state across a round boundary.
    sim = {
      ...sim,
      hazards: {
        ...sim.hazards,
        balconyBreakA: { ...sim.hazards!["balconyBreakA"]!, hp: 0, active: false, phase: "broken" },
      },
    };
    expect(sim.hazards!["balconyBreakA"]!.active).toBe(false);

    sim = {
      ...sim,
      players: { ...sim.players, [B]: { ...sim.players[B]!, lastHitBy: A, lastHitTick: sim.tick } },
    };
    const { tickResult } = killByFalling(director, sim, B);
    sim = tickResult.state;
    expect(director.phase.phase).toBe("RoundOver");

    sim = playThroughToNextRound(director, sim);
    expect(director.phase.phase).toBe("RoundActive");
    expect(director.phase.round).toBe(2);

    expect(sim.hazards!["balconyBreakA"]!.active).toBe(true);
    expect(sim.hazards!["balconyBreakA"]!.hp).toBe(16);
    expect(sim.hazards!["balconyBreakA"]!.phase).toBe("solid");
  });
});

describe("MatchDirector — sudden death (Phase 14)", () => {
  it("hands the sim a running sudden-death clock once the round passes its time limit, and takes it away when the round ends", () => {
    const director = new MatchDirector();
    let sim = startMatch(director);
    expect(sim.suddenDeathTicks ?? 0).toBe(0);

    sim = runTicks(director, sim, ROUND_TIME_LIMIT + 10);
    expect(director.phase.suddenDeath).toBe(true);
    expect(sim.suddenDeathTicks).toBe(director.phase.suddenDeathTicks);
    expect(sim.suddenDeathTicks).toBeGreaterThan(0);

    // Two knights who never swing still end the round: the bleed kills them.
    let ticks = 0;
    while (director.phase.phase === "RoundActive" && ticks < 60 * 30) {
      sim = runTicks(director, sim, 1);
      ticks += 1;
    }
    expect(director.phase.phase).toBe("RoundOver");
    expect(ticks).toBeLessThan(60 * 20);
    expect(sim.suddenDeathTicks ?? 0).toBe(0);
  });
});
