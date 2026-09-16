import { describe, expect, it } from "vitest";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimState } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import { ALL_ARENAS } from "./registry.js";
import type { ArenaDefinition } from "./types.js";
import { validateArena } from "./validate.js";

const PLAYER = playerId("gravity-check");
const GRAVITY_TICKS = 120;

/** Drops a lone `SimPlayer` from `spawn` with no input for `GRAVITY_TICKS`
 *  ticks — the plan's own gate check ("spawns a SimPlayer at every spawn
 *  point and runs gravity for 120 ticks, asserting that each player is
 *  grounded and alive"), run against the real sim rather than
 *  `validate.ts`'s cheap static raycast. */
function dropFromSpawn(arena: ArenaDefinition, spawn: ArenaDefinition["spawns"][number]): SimState {
  let state: SimState = {
    tick: 0,
    players: { [PLAYER]: createSimPlayer(spawn) },
    arena,
    rngSeed: 1,
  };
  for (let i = 0; i < GRAVITY_TICKS; i++) {
    state = step(state, {}).state;
  }
  return state;
}

describe.each(ALL_ARENAS)("arena: $id", (arena) => {
  it("passes static validation", () => {
    const result = validateArena(arena);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(arena.spawns.map((spawn, index) => [index, spawn] as const))(
    "spawn %i lands grounded and alive after 120 ticks of gravity",
    (_index, spawn) => {
      const finalState = dropFromSpawn(arena, spawn);
      const player = finalState.players[PLAYER]!;
      expect(player.action).not.toBe("Dead");
      expect(player.grounded).toBe(true);
    },
  );
});

describe("arena registry", () => {
  it("has six arenas with unique, matching ids", () => {
    expect(ALL_ARENAS).toHaveLength(6);
    const ids = ALL_ARENAS.map((arena) => arena.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
