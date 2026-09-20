import { ARENA_IDS, isArenaId, type ArenaId } from "../types/ids.js";
import { BRIDGE_ARENA } from "./bridge.js";
import { CASTLE_ROOM_ARENA } from "./castleRoom.js";
import { COLOSSEUM_ARENA } from "./colosseum.js";
import { DUNGEON_ARENA } from "./dungeon.js";
import { PIT_ARENA } from "./pit.js";
import { TUTORIAL_ARENA } from "./tutorial.js";
import type { ArenaDefinition } from "./types.js";
import { WOODEN_HALL_ARENA } from "./woodenHall.js";

/**
 * The six data-driven arenas (plan Phase 6 step 2) — every consumer that
 * needs an arena by id goes through this registry rather than importing an
 * individual arena file directly, so adding a seventh arena later is a
 * one-line change here instead of a hunt through every call site.
 */
export const ARENAS: Readonly<Record<ArenaId, ArenaDefinition>> = {
  [ARENA_IDS.PIT]: PIT_ARENA,
  [ARENA_IDS.CASTLE_ROOM]: CASTLE_ROOM_ARENA,
  [ARENA_IDS.COLOSSEUM]: COLOSSEUM_ARENA,
  [ARENA_IDS.BRIDGE]: BRIDGE_ARENA,
  [ARENA_IDS.WOODEN_HALL]: WOODEN_HALL_ARENA,
  [ARENA_IDS.DUNGEON]: DUNGEON_ARENA,
};

export const ALL_ARENAS: readonly ArenaDefinition[] = Object.values(ARENAS);

export function getArena(id: ArenaId): ArenaDefinition {
  return ARENAS[id];
}

/**
 * Any arena the game can be played on, by the id a room reports: the six real ones, and the
 * tutorial's. Deliberately not `getArena`/`ARENAS`: the tutorial arena is not player-selectable (it
 * must stay out of the lobby's picker and quick play's random draw).
 */
export function findArena(id: string): ArenaDefinition | undefined {
  if (isArenaId(id)) {
    return ARENAS[id];
  }
  return id === TUTORIAL_ARENA.id ? TUTORIAL_ARENA : undefined;
}

/** Picks uniformly at random from `ALL_ARENAS` — `rng` defaults to
 *  `Math.random` for convenience, but callers needing a deterministic pick
 *  (tests, or a seeded server-side draw) pass their own. */
export function randomArenaId(rng: () => number = Math.random): ArenaId {
  const ids = Object.values(ARENA_IDS) as ArenaId[];
  const index = Math.floor(rng() * ids.length);
  return ids[Math.min(index, ids.length - 1)]!;
}
