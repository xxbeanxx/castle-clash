import { describe, expect, it } from "vitest";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import {
  MAX_HP,
  SUDDEN_DEATH_MAX_MULTIPLIER,
  SUDDEN_DEATH_RAMP_TICKS,
  TICK_RATE,
} from "../config/game.js";
import { hashState } from "../math/hash.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimState } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import { suddenDeathDrain, suddenDeathMultiplier } from "./suddenDeath.js";

const A = playerId("a");
const B = playerId("b");

describe("suddenDeathMultiplier", () => {
  it("is 1 outside sudden death", () => {
    expect(suddenDeathMultiplier(0)).toBe(1);
    expect(suddenDeathMultiplier(-5)).toBe(1);
  });

  it("ramps linearly and then holds at the maximum", () => {
    expect(suddenDeathMultiplier(SUDDEN_DEATH_RAMP_TICKS / 2)).toBeCloseTo(
      1 + (SUDDEN_DEATH_MAX_MULTIPLIER - 1) / 2,
    );
    expect(suddenDeathMultiplier(SUDDEN_DEATH_RAMP_TICKS)).toBe(SUDDEN_DEATH_MAX_MULTIPLIER);
    expect(suddenDeathMultiplier(SUDDEN_DEATH_RAMP_TICKS * 10)).toBe(SUDDEN_DEATH_MAX_MULTIPLIER);
  });

  it("never falls as sudden death goes on", () => {
    let last = 0;
    for (let ticks = 0; ticks <= SUDDEN_DEATH_RAMP_TICKS + 60; ticks += 30) {
      const value = suddenDeathMultiplier(ticks);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });
});

describe("suddenDeathDrain", () => {
  it("is zero outside sudden death and positive inside it", () => {
    expect(suddenDeathDrain(0)).toBe(0);
    expect(suddenDeathDrain(1)).toBeGreaterThan(0);
  });
});

function standoff(suddenDeathTicks?: number): SimState {
  return {
    tick: 0,
    players: {
      // Far apart, doing nothing: no hit can ever land, so only the bleed can end this.
      [A]: { ...createSimPlayer({ x: 100, y: 632 }), grounded: true },
      [B]: { ...createSimPlayer({ x: 1000, y: 632 }), grounded: true },
    },
    arena: TESTBED_ARENA,
    rngSeed: 1,
    suddenDeathTicks,
  };
}

describe("sudden death in step()", () => {
  it("does nothing to a standoff that has not entered it", () => {
    let sim = standoff();
    for (let i = 0; i < 1200; i++) {
      sim = step(sim, {}).state;
    }
    expect(sim.players[A]!.hp).toBe(MAX_HP);
    expect(sim.players[B]!.hp).toBe(MAX_HP);
  });

  it("ends a standoff of two players who never swing, well inside a quarter minute", () => {
    // What `MatchDirector` does each tick: advance the sudden-death clock.
    let sim = standoff(1);
    let ticksToEnd = 0;
    let eliminated = 0;
    while (ticksToEnd < 60 * TICK_RATE && sim.players[A]!.action !== "Dead") {
      const result = step(sim, {});
      sim = { ...result.state, suddenDeathTicks: (result.state.suddenDeathTicks ?? 0) + 1 };
      ticksToEnd += 1;
      eliminated += result.events.filter(
        (e) => e.type === "eliminated" && e.cause === "suddenDeath",
      ).length;
    }
    expect(sim.players[A]!.action).toBe("Dead");
    expect(ticksToEnd).toBeGreaterThan(8 * TICK_RATE);
    expect(ticksToEnd).toBeLessThan(18 * TICK_RATE);
    // Both bled identically, so both die on the same tick: a drawn round, not a coin flip.
    expect(eliminated).toBe(2);
  });

  it("the player with more health outlasts the other", () => {
    let sim = standoff(1);
    sim = { ...sim, players: { ...sim.players, [B]: { ...sim.players[B]!, hp: 60 } } };
    for (let i = 0; i < 60 * TICK_RATE && sim.players[B]!.action !== "Dead"; i++) {
      const result = step(sim, {});
      sim = { ...result.state, suddenDeathTicks: (result.state.suddenDeathTicks ?? 0) + 1 };
    }
    expect(sim.players[B]!.action).toBe("Dead");
    expect(sim.players[A]!.action).not.toBe("Dead");
  });

  it("carries the sudden-death clock through a step, and it is part of the state hash", () => {
    const before = standoff(5);
    expect(step(before, {}).state.suddenDeathTicks).toBe(5);
    expect(hashState(standoff(5))).not.toBe(hashState(standoff(6)));
    // A state that never entered it hashes as it always did.
    expect(hashState(standoff())).toBe(hashState(standoff(0)));
  });
});
