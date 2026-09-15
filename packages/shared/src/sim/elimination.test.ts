import { describe, expect, it } from "vitest";
import { RING_OUT_CREDIT_TICKS } from "../config/game.js";
import { playerId } from "../types/ids.js";
import { step } from "./GameSimulation.js";
import { createSimPlayer, type SimState } from "./types.js";

const A = playerId("a");
const B = playerId("b");

const KILL_ZONE = { x: 0, y: 1000, w: 1000, h: 200 };

function stateWith(players: SimState["players"], overrides: Partial<SimState> = {}): SimState {
  return {
    tick: 0,
    players,
    arena: {
      id: "test",
      bounds: { x: 0, y: 0, w: 1000, h: 1000 },
      solids: [],
      platforms: [],
      spawns: [{ x: 0, y: 0 }],
      killZones: [KILL_ZONE],
      hazards: [],
    },
    rngSeed: 1,
    ...overrides,
  };
}

describe("kill-zone elimination", () => {
  it("marks a player Dead and emits an eliminated event when they overlap a kill zone", () => {
    const victim = { ...createSimPlayer({ x: 10, y: 1010 }), grounded: true };
    const result = step(stateWith({ [A]: victim }), {});

    expect(result.state.players[A]!.action).toBe("Dead");
    expect(result.state.players[A]!.hp).toBe(0);
    expect(result.events).toContainEqual({ type: "eliminated", victim: A, cause: "killZone" });
  });

  it("credits the last attacker within the ring-out window", () => {
    const victim = {
      ...createSimPlayer({ x: 10, y: 1010 }),
      grounded: true,
      lastHitBy: B,
      lastHitTick: 0,
    };
    const result = step(stateWith({ [A]: victim }, { tick: RING_OUT_CREDIT_TICKS - 1 }), {});

    expect(result.events).toContainEqual({ type: "eliminated", victim: A, by: B, cause: "killZone" });
  });

  it("does not credit an attacker once the ring-out window has passed", () => {
    const victim = {
      ...createSimPlayer({ x: 10, y: 1010 }),
      grounded: true,
      lastHitBy: B,
      lastHitTick: 0,
    };
    const result = step(stateWith({ [A]: victim }, { tick: RING_OUT_CREDIT_TICKS + 1 }), {});

    expect(result.events).toContainEqual({ type: "eliminated", victim: A, cause: "killZone" });
    expect(result.events).not.toContainEqual(
      expect.objectContaining({ type: "eliminated", by: B }),
    );
  });

  it("does not re-eliminate a player who is already Dead", () => {
    const victim = { ...createSimPlayer({ x: 10, y: 1010 }), action: "Dead" as const, hp: 0 };
    const result = step(stateWith({ [A]: victim }), {});

    expect(result.events).toEqual([]);
  });
});
