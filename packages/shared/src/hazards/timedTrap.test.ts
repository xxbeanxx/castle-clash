import { describe, expect, it } from "vitest";
import { TIMED_TRAP_ACTIVE_TICKS } from "../config/game.js";
import { createSimPlayer } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import type { TimedTrapDef } from "./types.js";
import { createHazardState, stepHazards } from "./step.js";

const A = playerId("a");
const BOX = { x: 0, y: 0, w: 100, h: 100 };

function trap(overrides: Partial<TimedTrapDef> = {}): TimedTrapDef {
  return {
    id: "trap",
    kind: "timedTrap",
    box: BOX,
    damage: 20,
    knockback: { x: 0, y: -300 },
    periodTicks: 120,
    warnTicks: 30,
    ...overrides,
  };
}

function phaseAt(hazards: readonly TimedTrapDef[], tick: number) {
  return stepHazards({
    tick,
    hazards,
    prevState: createHazardState(hazards),
    players: {},
    landedIds: new Set(),
  }).state["trap"]!.phase;
}

describe("TimedTrap", () => {
  it("warns before it activates, then returns to idle", () => {
    const def = trap({ periodTicks: 120, warnTicks: 30 });
    const hazards = [def];
    const idleEnd = 120 - 30 - TIMED_TRAP_ACTIVE_TICKS;

    expect(phaseAt(hazards, 0)).toBe("idle");
    expect(phaseAt(hazards, idleEnd - 1)).toBe("idle");
    expect(phaseAt(hazards, idleEnd)).toBe("warn");
    expect(phaseAt(hazards, idleEnd + 30 - 1)).toBe("warn");
    expect(phaseAt(hazards, idleEnd + 30)).toBe("active");
    expect(phaseAt(hazards, idleEnd + 30 + TIMED_TRAP_ACTIVE_TICKS - 1)).toBe("active");
    expect(phaseAt(hazards, idleEnd + 30 + TIMED_TRAP_ACTIVE_TICKS)).toBe("idle");
    expect(phaseAt(hazards, 120)).toBe("idle"); // wraps to the next period
  });

  it("deals damage/knockback exactly on the tick it enters active, once", () => {
    const def = trap({ periodTicks: 40, warnTicks: 10, damage: 20 });
    const hazards = [def];
    const activeTick = 40 - 10 - TIMED_TRAP_ACTIVE_TICKS + 10; // idleTicks + warnTicks

    const player = createSimPlayer({ x: 20, y: 20 });
    const beforeState = createHazardState(hazards);

    const warnResult = stepHazards({
      tick: activeTick - 1,
      hazards,
      prevState: beforeState,
      players: { [A]: player },
      landedIds: new Set(),
    });
    expect(warnResult.players[A]!.hp).toBe(player.hp);

    const activeResult = stepHazards({
      tick: activeTick,
      hazards,
      prevState: beforeState,
      players: { [A]: player },
      landedIds: new Set(),
    });
    expect(activeResult.players[A]!.hp).toBe(player.hp - 20);
    expect(activeResult.players[A]!.action).toBe("HitStun");
    expect(activeResult.events).toContainEqual({ type: "hazardTrap", hazardId: "trap", victims: [A] });

    // One tick later, still in the active window, but already applied.
    const stillActiveResult = stepHazards({
      tick: activeTick + 1,
      hazards,
      prevState: activeResult.state,
      players: activeResult.players,
      landedIds: new Set(),
    });
    expect(stillActiveResult.players[A]!.hp).toBe(player.hp - 20);
  });

  it("does not hit a player outside its box", () => {
    const def = trap({ periodTicks: 40, warnTicks: 10 });
    const hazards = [def];
    const activeTick = 40 - 10 - TIMED_TRAP_ACTIVE_TICKS + 10;
    const player = createSimPlayer({ x: 1000, y: 1000 });
    const result = stepHazards({
      tick: activeTick,
      hazards,
      prevState: createHazardState(hazards),
      players: { [A]: player },
      landedIds: new Set(),
    });
    expect(result.players[A]!.hp).toBe(player.hp);
  });
});
