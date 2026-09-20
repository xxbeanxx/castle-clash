import type { ArenaDefinition } from "./types.js";

/**
 * The first-run tutorial's arena (Phase 14 step 4): a floor, walls, and one platform. It is not the
 * testbed because the testbed's platform sits 180 px above its floor and a jump rises about 153 px,
 * so "jump onto the platform, then drop through it" (a lesson) would be impossible there. This one
 * is 120 px up: reachable with one ordinary jump. Not in `ARENAS`: it is never a player's choice
 * and never quick play's random draw (`findArena` is the only way to it).
 */
export const TUTORIAL_ARENA: ArenaDefinition = {
  id: "tutorial",
  bounds: { x: 0, y: 0, w: 1280, h: 720 },
  solids: [
    { x: 0, y: 680, w: 1280, h: 40 },
    { x: 0, y: 0, w: 20, h: 720 },
    { x: 1260, y: 0, w: 20, h: 720 },
  ],
  platforms: [{ x: 480, y: 560, w: 320, h: 16 }],
  spawns: [
    { x: 200, y: 600 },
    { x: 1000, y: 600 },
  ],
  killZones: [{ x: -2000, y: 720, w: 5280, h: 400 }],
  hazards: [],
};
