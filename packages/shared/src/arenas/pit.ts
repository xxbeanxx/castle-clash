import type { ArenaDefinition } from "./types.js";

/**
 * Two ledges around a central drop (plan Phase 6 table). The gap between the
 * ledges (x:500-780) has no static floor at all — a `CollapsingPlatform`
 * bridge is the only way across, and it's rigged to fall once someone
 * commits to crossing it. Falling into the gap hits the hazard-authored
 * `pitDrop` KillZone well before reaching the arena's boundary blast zone.
 */
export const PIT_ARENA: ArenaDefinition = {
  id: "pit",
  bounds: { x: 0, y: 0, w: 1280, h: 720 },
  solids: [
    { x: 0, y: 0, w: 20, h: 720 },
    { x: 1260, y: 0, w: 20, h: 720 },
    { x: 20, y: 600, w: 480, h: 40 },
    { x: 780, y: 600, w: 480, h: 40 },
  ],
  platforms: [],
  spawns: [
    { x: 80, y: 520 },
    { x: 380, y: 520 },
    { x: 900, y: 520 },
    { x: 1180, y: 520 },
  ],
  killZones: [{ x: -2000, y: 900, w: 5280, h: 400 }],
  hazards: [
    { id: "pitDrop", kind: "killZone", box: { x: 500, y: 200, w: 280, h: 520 } },
    {
      id: "bridgeA",
      kind: "collapsingPlatform",
      box: { x: 520, y: 600, w: 100, h: 20 },
      delayTicks: 30,
    },
    {
      id: "bridgeB",
      kind: "collapsingPlatform",
      box: { x: 660, y: 600, w: 100, h: 20 },
      delayTicks: 30,
    },
  ],
};
