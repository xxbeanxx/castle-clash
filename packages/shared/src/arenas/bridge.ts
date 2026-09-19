import type { ArenaDefinition } from "./types.js";

const PLANK_WIDTH = 160;
const PLANK_Y = 680;
const PLANK_H = 40;

function plank(id: string, x: number) {
  return {
    id,
    kind: "breakableFloor" as const,
    box: { x, y: PLANK_Y, w: PLANK_WIDTH, h: PLANK_H },
    hp: 10,
    breakOn: "any" as const,
    respawnPerRound: true,
  };
}

/**
 * Long and narrow, open sides (plan Phase 6 table): no boundary walls at
 * all — only two small solid anchors at the far ends, with the entire deck
 * between them made of `BreakableFloor` planks. Stepping off either end
 * (or falling through a broken plank) hits a hazard-authored KillZone
 * immediately, rather than a long fall to the boundary blast zone.
 */
export const BRIDGE_ARENA: ArenaDefinition = {
  id: "bridge",
  bounds: { x: 0, y: 0, w: 1280, h: 720 },
  solids: [
    { x: 40, y: 680, w: 120, h: 40 },
    { x: 1120, y: 680, w: 120, h: 40 },
  ],
  platforms: [],
  spawns: [
    { x: 60, y: 600 },
    { x: 130, y: 600 },
    { x: 1140, y: 600 },
    { x: 1210, y: 600 },
  ],
  killZones: [{ x: -2000, y: 900, w: 5280, h: 400 }],
  hazards: [
    { id: "leftDrop", kind: "killZone", box: { x: 0, y: 0, w: 40, h: 720 } },
    { id: "rightDrop", kind: "killZone", box: { x: 1240, y: 0, w: 40, h: 720 } },
    plank("plankA", 160),
    plank("plankB", 320),
    plank("plankC", 480),
    plank("plankD", 640),
    plank("plankE", 800),
    plank("plankF", 960),
  ],
};
