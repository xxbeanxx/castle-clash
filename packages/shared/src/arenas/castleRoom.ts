import type { ArenaDefinition } from "./types.js";

/**
 * Chandelier one-way platforms over a throne dais (plan Phase 6 table). The
 * dais is a raised solid block, not a platform, so it's landable from
 * beneath too (a throne room floor step, not something you can jump through).
 */
export const CASTLE_ROOM_ARENA: ArenaDefinition = {
  id: "castleRoom",
  bounds: { x: 0, y: 0, w: 1280, h: 720 },
  solids: [
    { x: 0, y: 0, w: 20, h: 720 },
    { x: 1260, y: 0, w: 20, h: 720 },
    { x: 20, y: 680, w: 1240, h: 40 },
    { x: 980, y: 560, w: 260, h: 160 },
  ],
  platforms: [
    { x: 200, y: 420, w: 200, h: 16 },
    { x: 550, y: 340, w: 200, h: 16 },
    { x: 850, y: 420, w: 200, h: 16 },
  ],
  spawns: [
    { x: 80, y: 600 },
    { x: 300, y: 600 },
    { x: 550, y: 600 },
    { x: 750, y: 600 },
    { x: 1050, y: 480 },
  ],
  killZones: [{ x: -2000, y: 900, w: 5280, h: 400 }],
  hazards: [
    {
      id: "brazierLeft",
      kind: "fireZone",
      box: { x: 150, y: 600, w: 80, h: 80 },
      dps: 15,
      cycle: { onTicks: 120, offTicks: 120 },
    },
    {
      id: "brazierRight",
      kind: "fireZone",
      box: { x: 620, y: 600, w: 80, h: 80 },
      dps: 15,
      cycle: { onTicks: 120, offTicks: 120 },
    },
  ],
};
