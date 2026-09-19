import { describe, expect, it } from "vitest";
import { getAttack, getWeapon } from "../combat/weapons.js";
import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../config/game.js";
import { createSimPlayer } from "../sim/types.js";
import { playerId, WEAPON_IDS } from "../types/ids.js";
import type { BreakableFloorDef } from "./types.js";
import { createHazardState, dynamicSolids, stepHazards } from "./step.js";

const A = playerId("a");
const BOX = { x: 0, y: 100, w: 200, h: 20 };

function floor(overrides: Partial<BreakableFloorDef> = {}): BreakableFloorDef {
  return { id: "floor", kind: "breakableFloor", box: BOX, hp: 16, breakOn: "heavy", respawnPerRound: true, ...overrides };
}

/** A player mid-heavy-attack (or light), standing at the floor's edge so
 *  the sword's reach box (facing right, PLAYER_WIDTH..+70) overlaps `BOX`. */
function attackingPlayer(kind: "heavy" | "light"): ReturnType<typeof createSimPlayer> {
  const attack = getAttack(getWeapon(WEAPON_IDS.SWORD), kind);
  return {
    ...createSimPlayer({ x: BOX.x - PLAYER_WIDTH - 10, y: BOX.y - PLAYER_HEIGHT + 5 }),
    action: "AttackActive",
    attackKind: kind,
    actionTick: attack.hitboxes[0]!.tickOffset,
    facing: 1,
  };
}

describe("BreakableFloor", () => {
  it("acts as a solid while hp > 0", () => {
    const hazards = [floor()];
    const state = createHazardState(hazards);
    expect(state["floor"]!.active).toBe(true);
    expect(dynamicSolids(hazards, state)).toContainEqual(BOX);
  });

  it("a heavy attack breaks a floor of matching HP, but a light attack doesn't (breakOn: heavy)", () => {
    const def = floor({ hp: 16 }); // sword heavy damage is 16
    const hazards = [def];

    const lightResult = stepHazards({
      tick: 1,
      hazards,
      prevState: createHazardState(hazards),
      players: { [A]: attackingPlayer("light") },
      landedIds: new Set(),
    });
    expect(lightResult.state["floor"]!.hp).toBe(16);
    expect(lightResult.state["floor"]!.active).toBe(true);

    const heavyResult = stepHazards({
      tick: 1,
      hazards,
      prevState: createHazardState(hazards),
      players: { [A]: attackingPlayer("heavy") },
      landedIds: new Set(),
    });
    expect(heavyResult.state["floor"]!.hp).toBe(0);
    expect(heavyResult.state["floor"]!.active).toBe(false);
    expect(heavyResult.state["floor"]!.phase).toBe("broken");
    expect(heavyResult.events).toContainEqual({ type: "hazardBreak", hazardId: "floor" });
  });

  it("breakOn: any breaks on a light attack too", () => {
    const def = floor({ breakOn: "any", hp: 5 });
    const hazards = [def];
    const result = stepHazards({
      tick: 1,
      hazards,
      prevState: createHazardState(hazards),
      players: { [A]: attackingPlayer("light") },
      landedIds: new Set(),
    });
    expect(result.state["floor"]!.active).toBe(false);
  });

  it("breakOn: landing breaks instantly when a player lands on it", () => {
    const def = floor({ breakOn: "landing", hp: 1 });
    const hazards = [def];
    const player = { ...createSimPlayer({ x: BOX.x + 10, y: BOX.y - PLAYER_HEIGHT + 5 }), grounded: true };
    const result = stepHazards({
      tick: 1,
      hazards,
      prevState: createHazardState(hazards),
      players: { [A]: player },
      landedIds: new Set([A]),
    });
    expect(result.state["floor"]!.active).toBe(false);
  });

  it("does not re-break an already-broken floor, and stays broken", () => {
    const def = floor({ hp: 16 });
    const hazards = [def];
    const broken = { ...createHazardState(hazards)["floor"]!, hp: 0, active: false, phase: "broken" };
    const result = stepHazards({
      tick: 5,
      hazards,
      prevState: { floor: broken },
      players: {},
      landedIds: new Set(),
    });
    expect(result.state["floor"]).toEqual(broken);
    expect(result.events).toEqual([]);
  });

  it("resets to full hp between rounds via resetHazardState", async () => {
    const { resetHazardState } = await import("./step.js");
    const def = floor({ hp: 16 });
    const hazards = [def];
    const broken = { ...createHazardState(hazards)["floor"]!, hp: 0, active: false, phase: "broken" };
    const reset = resetHazardState(hazards, { floor: broken }, 0);
    expect(reset["floor"]!.hp).toBe(16);
    expect(reset["floor"]!.active).toBe(true);
  });
});
