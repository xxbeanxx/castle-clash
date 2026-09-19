import type { ArenaDefinition } from "./types.js";

/**
 * Low ceiling, tight corridors (plan Phase 6 table): a shorter, capped
 * arena (a solid ceiling, not just an open top) with `FireZone` pits at
 * ground level and a `TimedTrap` portcullis gating the middle chokepoint.
 */
export const DUNGEON_ARENA: ArenaDefinition = {
  id: "dungeon",
  bounds: { x: 0, y: 0, w: 1280, h: 420 },
  solids: [
    { x: 0, y: 0, w: 20, h: 420 },
    { x: 1260, y: 0, w: 20, h: 420 },
    { x: 20, y: 0, w: 1240, h: 20 },
    { x: 20, y: 380, w: 1240, h: 40 },
  ],
  platforms: [],
  spawns: [
    { x: 80, y: 300 },
    { x: 480, y: 300 },
    { x: 750, y: 300 },
    { x: 1150, y: 300 },
  ],
  killZones: [{ x: -2000, y: 600, w: 5280, h: 400 }],
  hazards: [
    {
      id: "firePitLeft",
      kind: "fireZone",
      box: { x: 250, y: 300, w: 100, h: 80 },
      dps: 20,
      cycle: { onTicks: 90, offTicks: 90 },
    },
    {
      id: "firePitRight",
      kind: "fireZone",
      box: { x: 900, y: 300, w: 100, h: 80 },
      dps: 20,
      cycle: { onTicks: 90, offTicks: 90 },
    },
    {
      id: "portcullis",
      kind: "timedTrap",
      box: { x: 600, y: 20, w: 40, h: 360 },
      damage: 22,
      knockback: { x: -260, y: -150 },
      periodTicks: 200,
      warnTicks: 50,
    },
  ],
};
