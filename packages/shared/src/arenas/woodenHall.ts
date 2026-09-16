import type { ArenaDefinition } from "./types.js";

/**
 * Multi-level balconies with one-way stairs (plan Phase 6 table): the
 * ground floor and the lower/upper stair landings are static one-way
 * platforms, while the two upper balconies are `BreakableFloor` hazards
 * (`breakOn: "heavy"`) — they can be knocked out from under someone
 * standing on them.
 */
export const WOODEN_HALL_ARENA: ArenaDefinition = {
  id: "woodenHall",
  bounds: { x: 0, y: 0, w: 1280, h: 720 },
  solids: [
    { x: 0, y: 0, w: 20, h: 720 },
    { x: 1260, y: 0, w: 20, h: 720 },
    { x: 20, y: 680, w: 1240, h: 40 },
  ],
  platforms: [
    { x: 150, y: 560, w: 220, h: 16 },
    { x: 450, y: 440, w: 220, h: 16 },
    { x: 850, y: 440, w: 200, h: 16 },
  ],
  spawns: [
    { x: 80, y: 600 },
    { x: 250, y: 490 },
    { x: 550, y: 370 },
    { x: 900, y: 490 },
    { x: 1150, y: 600 },
  ],
  killZones: [{ x: -2000, y: 900, w: 5280, h: 400 }],
  hazards: [
    {
      id: "balconyBreakA",
      kind: "breakableFloor",
      box: { x: 750, y: 560, w: 220, h: 16 },
      hp: 16,
      breakOn: "heavy",
      respawnPerRound: true,
    },
    {
      id: "balconyBreakB",
      kind: "breakableFloor",
      box: { x: 1050, y: 320, w: 180, h: 16 },
      hp: 16,
      breakOn: "heavy",
      respawnPerRound: true,
    },
  ],
};
