import {
  ARENA_IDS,
  type ArenaDefinition,
  type ArenaId,
  type HazardKind,
} from "@castle-clash/shared";

/** Player-facing arena names, keyed by the shared id so a new arena is a compile error here until named. */
export const ARENA_LABELS: Record<ArenaId, string> = {
  [ARENA_IDS.PIT]: "Pit",
  [ARENA_IDS.CASTLE_ROOM]: "Castle Room",
  [ARENA_IDS.COLOSSEUM]: "Colosseum",
  [ARENA_IDS.BRIDGE]: "Bridge",
  [ARENA_IDS.WOODEN_HALL]: "Wooden Hall",
  [ARENA_IDS.DUNGEON]: "Dungeon",
};

/** The name for an arena id known only as a string (an `ArenaDefinition.id`). Falls back to the id itself. */
export function arenaLabel(id: string): string {
  return ARENA_LABELS[id as ArenaId] ?? id;
}

const HAZARD_LABELS: Record<HazardKind, string> = {
  fireZone: "Fire",
  breakableFloor: "Breakable floor",
  killZone: "Deadly drop",
  timedTrap: "Timed trap",
  collapsingPlatform: "Collapsing platform",
};

/** The distinct hazards an arena carries, read from its definition so the copy can't drift from the game. */
export function hazardSummary(arena: ArenaDefinition): string[] {
  return [...new Set(arena.hazards.map((hazard) => HAZARD_LABELS[hazard.kind]))];
}
