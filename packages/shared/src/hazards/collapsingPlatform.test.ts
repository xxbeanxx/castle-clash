import { describe, expect, it } from "vitest";
import { PLAYER_HEIGHT } from "../config/game.js";
import { createSimPlayer } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import type { CollapsingPlatformDef } from "./types.js";
import { createHazardState, dynamicPlatforms, stepHazards } from "./step.js";

const A = playerId("a");
const BOX = { x: 400, y: 300, w: 120, h: 20 };

function platform(overrides: Partial<CollapsingPlatformDef> = {}): CollapsingPlatformDef {
  return { id: "plat", kind: "collapsingPlatform", box: BOX, delayTicks: 20, ...overrides };
}

function standingPlayer() {
  return { ...createSimPlayer({ x: BOX.x + 10, y: BOX.y - PLAYER_HEIGHT + 5 }), grounded: true };
}

describe("CollapsingPlatform", () => {
  it("stays stable and solid until stood on", () => {
    const hazards = [platform()];
    const state = createHazardState(hazards);
    expect(state["plat"]!.phase).toBe("stable");
    expect(dynamicPlatforms(hazards, state)).toContainEqual(BOX);

    const result = stepHazards({ tick: 1, hazards, prevState: state, players: {}, landedIds: new Set() });
    expect(result.state["plat"]!.phase).toBe("stable");
  });

  it("starts shaking the tick it's stood on, then falls after delayTicks", () => {
    const def = platform({ delayTicks: 3 });
    const hazards = [def];
    let state = createHazardState(hazards);
    const players = { [A]: standingPlayer() };

    let result = stepHazards({ tick: 1, hazards, prevState: state, players, landedIds: new Set() });
    expect(result.state["plat"]!.phase).toBe("shaking");
    expect(result.state["plat"]!.timer).toBe(3);
    state = result.state;

    result = stepHazards({ tick: 2, hazards, prevState: state, players: {}, landedIds: new Set() });
    expect(result.state["plat"]!.phase).toBe("shaking");
    expect(result.state["plat"]!.timer).toBe(2);
    state = result.state;

    result = stepHazards({ tick: 3, hazards, prevState: state, players: {}, landedIds: new Set() });
    state = result.state;
    result = stepHazards({ tick: 4, hazards, prevState: state, players: {}, landedIds: new Set() });

    expect(result.state["plat"]!.phase).toBe("fallen");
    expect(result.state["plat"]!.active).toBe(false);
    expect(result.events).toContainEqual({ type: "hazardFall", hazardId: "plat" });
    expect(dynamicPlatforms(hazards, result.state)).not.toContainEqual(BOX);
  });

  it("stays fallen once it falls, even with nobody standing on it", () => {
    const hazards = [platform()];
    const fallen = { ...createHazardState(hazards)["plat"]!, phase: "fallen", active: false, timer: 0 };
    const result = stepHazards({
      tick: 100,
      hazards,
      prevState: { plat: fallen },
      players: {},
      landedIds: new Set(),
    });
    expect(result.state["plat"]).toEqual(fallen);
  });
});
