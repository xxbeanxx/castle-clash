import { describe, expect, it } from "vitest";
import { createHazardState } from "../hazards/step.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimState } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import { PIT_ARENA } from "./pit.js";

const A = playerId("a");

function simWith(x: number, y: number): SimState {
  return {
    tick: 0,
    players: { [A]: createSimPlayer({ x, y }) },
    arena: PIT_ARENA,
    rngSeed: 1,
    hazards: createHazardState(PIT_ARENA.hazards),
  };
}

describe("Pit", () => {
  it("lets a player stand on the bridge (its kill zone sits below the planks, not through them)", () => {
    let sim = simWith(540, 552);
    let eliminations = 0;
    for (let i = 0; i < 10; i++) {
      const result = step(sim, {});
      sim = result.state;
      eliminations += result.events.filter((event) => event.type === "eliminated").length;
    }
    expect(eliminations).toBe(0);
    expect(sim.players[A]!.action).not.toBe("Dead");
  });

  it("still kills a player who falls into the gap", () => {
    let sim = simWith(630, 560);
    for (let i = 0; i < 90 && sim.players[A]!.action !== "Dead"; i++) {
      sim = step(sim, {}).state;
    }
    expect(sim.players[A]!.action).toBe("Dead");
  });
});
