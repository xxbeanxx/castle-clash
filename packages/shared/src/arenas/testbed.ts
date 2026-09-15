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
  // A blast zone below the floor — unreachable by falling through the solid
  // floor during normal play, but real once Phase 6 arenas have actual gaps.
  // Kept here (rather than left empty) so Phase 5's kill-zone elimination
  // path has a real geometry to test against instead of only unit-testing
  // the check in isolation.
  killZones: [{ x: -2000, y: 720, w: 5280, h: 400 }],
  hazards: [],
};
