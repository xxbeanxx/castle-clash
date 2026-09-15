import type { AABB } from "../math/aabb.js";
import type { Vec } from "../math/vec.js";

/**
 * Placeholder until Phase 6 lands `shared/hazards`'s closed union — every
 * arena's `hazards` list must be empty until then.
 */
export type HazardDef = never;

export interface ArenaDefinition {
  id: string;
  bounds: AABB;
  solids: readonly AABB[];
  platforms: readonly AABB[];
  spawns: readonly Vec[];
  killZones: readonly AABB[];
  hazards: readonly HazardDef[];
}

/**
 * The sim reads arena geometry through this alias. Phase 3 arenas are static,
 * so it's just the definition itself; Phase 6 may need to distinguish
 * per-match runtime state (hazard timers, broken floors) from the shared
 * static definition.
 */
export type ArenaRuntime = ArenaDefinition;
