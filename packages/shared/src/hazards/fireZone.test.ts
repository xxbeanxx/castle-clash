import { describe, expect, it } from "vitest";
import { createSimPlayer } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import type { FireZoneDef } from "./types.js";
import { createHazardState, stepHazards } from "./step.js";

const A = playerId("a");
const BOX = { x: 0, y: 0, w: 400, h: 200 };

function fireZone(overrides: Partial<FireZoneDef> = {}): FireZoneDef {
  return { id: "fire", kind: "fireZone", box: BOX, dps: 30, ...overrides };
}

describe("FireZone", () => {
  it("cycles on and off at exact ticks", () => {
    const def = fireZone({ cycle: { onTicks: 10, offTicks: 5 } });
    const hazards = [def];

    // period = 15: ticks [0,10) on, [10,15) off, repeating.
    const phaseAt = (tick: number) => stepHazards({
      tick,
      hazards,
      prevState: createHazardState(hazards),
      players: {},
      landedIds: new Set(),
    }).state["fire"]!.phase;

    expect(phaseAt(0)).toBe("on");
    expect(phaseAt(9)).toBe("on");
    expect(phaseAt(10)).toBe("off");
    expect(phaseAt(14)).toBe("off");
    expect(phaseAt(15)).toBe("on");
    expect(phaseAt(24)).toBe("on");
    expect(phaseAt(25)).toBe("off");
  });

  it("is always on when no cycle is given", () => {
    const hazards = [fireZone()];
    const result = stepHazards({
      tick: 1,
      hazards,
      prevState: createHazardState(hazards),
      players: {},
      landedIds: new Set(),
    });
    expect(result.state["fire"]!.active).toBe(true);
  });

  it("deals dps/TICK_RATE damage per tick to an overlapping player, hitstun-free", () => {
    const def = fireZone({ dps: 30 });
    const hazards = [def];
    let players = { [A]: { ...createSimPlayer({ x: 100, y: 50 }), hp: 100 } };
    let state = createHazardState(hazards);

    const before = players[A]!.action;
    const result = stepHazards({ tick: 1, hazards, prevState: state, players, landedIds: new Set() });
    players = result.players;
    state = result.state;

    expect(players[A]!.hp).toBeCloseTo(100 - 30 / 60, 5);
    expect(players[A]!.action).toBe(before); // no hitstun
  });

  it("standing in fire for 60 ticks deals dps ± 1", () => {
    const def = fireZone({ dps: 30 });
    const hazards = [def];
    let players: Record<string, ReturnType<typeof createSimPlayer>> = {
      [A]: createSimPlayer({ x: 180, y: 80 }),
    };
    let state = createHazardState(hazards);

    for (let tick = 1; tick <= 60; tick++) {
      const result = stepHazards({ tick, hazards, prevState: state, players, landedIds: new Set() });
      players = result.players;
      state = result.state;
    }

    expect(players[A]!.hp).toBeGreaterThanOrEqual(100 - 30 - 1);
    expect(players[A]!.hp).toBeLessThanOrEqual(100 - 30 + 1);
  });

  it("does not damage a Dead player", () => {
    const hazards = [fireZone()];
    const player = { ...createSimPlayer({ x: 100, y: 50 }), action: "Dead" as const, hp: 0 };
    const result = stepHazards({
      tick: 1,
      hazards,
      prevState: createHazardState(hazards),
      players: { [A]: player },
      landedIds: new Set(),
    });
    expect(result.players[A]!.hp).toBe(0);
  });
});
