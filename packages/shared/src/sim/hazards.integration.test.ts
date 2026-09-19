import { describe, expect, it } from "vitest";
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../config/game.js";
import type { BreakableFloorDef, KillZoneDef } from "../hazards/types.js";
import { playerId } from "../types/ids.js";
import { step } from "./GameSimulation.js";
import { createSimPlayer, type SimState } from "./types.js";

const A = playerId("a");

/**
 * Wiring-level checks the pure `hazards/*.test.ts` files can't cover on
 * their own — hazards feeding real physics (a broken floor stops being
 * solid) and real elimination (a hazard-authored KillZone reaches the same
 * "eliminated" path as `ArenaDefinition.killZones`), both driven through
 * `GameSimulation.step` rather than `stepHazards` in isolation.
 */
describe("hazards wired into GameSimulation.step", () => {
  it("a player on a broken floor falls once the floor breaks", () => {
    const floorBox = { x: 0, y: 100, w: 200, h: 20 };
    const floor: BreakableFloorDef = {
      id: "floor",
      kind: "breakableFloor",
      box: floorBox,
      hp: 16,
      breakOn: "heavy",
      respawnPerRound: true,
    };
    const arena = {
      id: "test",
      bounds: { x: 0, y: 0, w: 1000, h: 1000 },
      solids: [],
      platforms: [],
      spawns: [{ x: 20, y: floorBox.y - PLAYER_HEIGHT }],
      killZones: [],
      hazards: [floor],
    };

    // Standing on the floor, grounded — a heavy attack's hitbox reaches
    // back to the floor box (facing left, sword reach 70, standing right
    // at its edge). `GameSimulation.step`'s FSM stage advances `actionTick`
    // by 1 before hazard/combat hitbox checks run (it stays in
    // AttackActive, an unchanged state), so starting at `actionTick: 0`
    // lands on `hitboxes[1]`, not `hitboxes[0]` — any offset in the
    // attack's active window works, since `activeEveryTick` covers all of
    // them.
    let state: SimState = {
      tick: 0,
      players: {
        [A]: {
          ...createSimPlayer({
            x: floorBox.x + floorBox.w - PLAYER_WIDTH - 5,
            y: floorBox.y - PLAYER_HEIGHT + 10,
          }),
          grounded: true,
          facing: -1,
          action: "AttackActive",
          attackKind: "heavy",
          actionTick: 0,
        },
      },
      arena,
      rngSeed: 1,
    };

    const result = step(state, {});
    expect(result.state.hazards!["floor"]!.active).toBe(false);
    expect(result.events).toContainEqual({ type: "hazardBreak", hazardId: "floor" });

    // Run gravity a while longer: no longer solid, so the player falls
    // through instead of staying grounded on it.
    state = result.state;
    for (let i = 0; i < 20; i++) {
      state = step(state, {}).state;
    }
    expect(state.players[A]!.grounded).toBe(false);
    expect(state.players[A]!.pos.y).toBeGreaterThan(floorBox.y);
  });

  it("a hazard-authored KillZone eliminates in one tick, same as arena.killZones", () => {
    const killZoneBox = { x: 0, y: 500, w: 200, h: 100 };
    const hazard: KillZoneDef = { id: "pit", kind: "killZone", box: killZoneBox };
    const arena = {
      id: "test",
      bounds: { x: 0, y: 0, w: 1000, h: 1000 },
      solids: [],
      platforms: [],
      spawns: [{ x: 10, y: 510 }],
      killZones: [],
      hazards: [hazard],
    };

    const state: SimState = {
      tick: 0,
      players: { [A]: { ...createSimPlayer({ x: 10, y: 510 }), grounded: true } },
      arena,
      rngSeed: 1,
    };

    const result = step(state, {});
    expect(result.state.players[A]!.action).toBe("Dead");
    expect(result.events).toContainEqual({ type: "eliminated", victim: A, cause: "killZone" });
  });

  it("fire damage without a full-HP kill emits no eliminated event, but a lethal burst does", () => {
    const fireBox = { x: 0, y: 0, w: 200, h: 200 };
    const arena = {
      id: "test",
      bounds: { x: 0, y: 0, w: 1000, h: 1000 },
      solids: [],
      platforms: [],
      spawns: [{ x: 20, y: 20 }],
      killZones: [],
      hazards: [{ id: "fire", kind: "fireZone" as const, box: fireBox, dps: 6000 }],
    };

    const state: SimState = {
      tick: 0,
      players: { [A]: createSimPlayer({ x: 20, y: 20 }) },
      arena,
      rngSeed: 1,
    };

    const result = step(state, {});
    expect(result.state.players[A]!.hp).toBe(0);
    expect(result.state.players[A]!.action).toBe("Dead");
    expect(result.events).toContainEqual({ type: "eliminated", victim: A, cause: "hazard" });
  });
});
