import type { ArenaDefinition } from "./types.js";

/**
 * The one arena Phase 3 needs: a floor, two side walls, and a single
 * one-way platform, enough to exercise every physics/movement behavior the
 * plan's testing strategy checks. Real, data-driven arenas land in Phase 6.
 */
export const TESTBED_ARENA: ArenaDefinition = {
  id: "testbed",
  bounds: { x: 0, y: 0, w: 1280, h: 720 },
  solids: [
    { x: 0, y: 680, w: 1280, h: 40 },
    { x: 0, y: 0, w: 20, h: 720 },
    { x: 1260, y: 0, w: 20, h: 720 },
  ],
  platforms: [{ x: 480, y: 500, w: 320, h: 20 }],
  spawns: [
    { x: 200, y: 600 },
    { x: 1000, y: 600 },
  ],
  killZones: [],
  hazards: [],
};
