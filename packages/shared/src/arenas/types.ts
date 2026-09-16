import type { HazardDef } from "../hazards/types.js";
import type { AABB } from "../math/aabb.js";
import type { Vec } from "../math/vec.js";

export type { HazardDef };

export interface ArenaDefinition {
  id: string;
  bounds: AABB;
  solids: readonly AABB[];
  platforms: readonly AABB[];
  spawns: readonly Vec[];
  /** Static, always-lethal-on-overlap geometry — typically an offscreen
   *  blast zone below the whole level (every arena needs one of these
   *  regardless of hazards, same as `testbed.ts`'s). A `HazardDef` of kind
   *  `"killZone"` in `hazards` below is a second, arena-authored source of
   *  the same instant-elimination check (e.g. Pit's central drop) — `sim/
   *  GameSimulation.step` merges both lists at runtime rather than one
   *  subsuming the other, since only the hazard variant participates in
   *  `hazards/step.ts`'s per-tick `HazardRuntimeState` bookkeeping (and so,
   *  in principle, could later be toggled off — nothing in this phase does
   *  that yet). */
  killZones: readonly AABB[];
  hazards: readonly HazardDef[];
}

/**
 * The sim reads arena geometry through this alias. Static geometry
 * (`solids`/`platforms`/`killZones`/hazard `box`es) never changes mid-match
 * — only `SimState.hazards`' per-hazard `HazardRuntimeState` (hp, broken/
 * fallen phase, timers) does, kept separately so the same `ArenaDefinition`
 * can be shared, unmutated, across every match using that arena.
 */
export type ArenaRuntime = ArenaDefinition;
