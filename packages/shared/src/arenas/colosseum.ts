import type { ArenaDefinition } from "./types.js";

/**
 * Wide flat floor with raised stands at both ends (plan Phase 6 table) —
 * the stands are solid risers players can stand on, not just scenery.
 * `TimedTrap` floor spikes punish camping the open middle.
 */
export const COLOSSEUM_ARENA: ArenaDefinition = {
  id: "colosseum",
  bounds: { x: 0, y: 0, w: 1280, h: 720 },
  solids: [
    { x: 0, y: 0, w: 20, h: 720 },
    { x: 1260, y: 0, w: 20, h: 720 },
    { x: 20, y: 680, w: 1240, h: 40 },
    { x: 20, y: 560, w: 220, h: 120 },
    { x: 1040, y: 560, w: 220, h: 120 },
  ],
  platforms: [],
  spawns: [
    { x: 100, y: 480 },
    { x: 300, y: 600 },
    { x: 500, y: 600 },
    { x: 780, y: 600 },
    { x: 980, y: 600 },
    { x: 1160, y: 480 },
  ],
  killZones: [{ x: -2000, y: 900, w: 5280, h: 400 }],
  hazards: [
    {
      id: "spikeLeft",
      kind: "timedTrap",
      box: { x: 380, y: 640, w: 60, h: 40 },
      damage: 18,
      knockback: { x: 0, y: -260 },
      periodTicks: 150,
      warnTicks: 40,
    },
    {
      id: "spikeRight",
      kind: "timedTrap",
      box: { x: 840, y: 640, w: 60, h: 40 },
      damage: 18,
      knockback: { x: 0, y: -260 },
      periodTicks: 150,
      warnTicks: 40,
    },
  ],
};
