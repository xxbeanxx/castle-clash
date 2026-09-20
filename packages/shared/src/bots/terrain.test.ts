import { describe, expect, it } from "vitest";
import type { ArenaDefinition } from "../arenas/types.js";
import { PIT_ARENA } from "../arenas/pit.js";
import { createHazardState } from "../hazards/step.js";
import type { SimState } from "../sim/types.js";
import { footingAhead, standingOnPlatform } from "./terrain.js";

function simOn(arena: ArenaDefinition): SimState {
  return { tick: 0, players: {}, arena, rngSeed: 1, hazards: createHazardState(arena.hazards) };
}

/** A 300 px ledge with nothing past it but the blast zone. */
const LEDGE: ArenaDefinition = {
  id: "ledge",
  bounds: { x: 0, y: 0, w: 1280, h: 720 },
  solids: [{ x: 0, y: 600, w: 300, h: 40 }],
  platforms: [{ x: 100, y: 450, w: 100, h: 16 }],
  spawns: [{ x: 50, y: 552 }],
  killZones: [{ x: -2000, y: 900, w: 5280, h: 400 }],
  hazards: [],
};

describe("footingAhead", () => {
  it("is clear on solid ground", () => {
    expect(footingAhead(simOn(LEDGE), { x: 100, y: 552 }, 1)).toEqual({
      blocked: false,
      canLeap: false,
    });
  });

  it("blocks the step that would leave the last ledge, and cannot leap a void with nothing beyond it", () => {
    expect(footingAhead(simOn(LEDGE), { x: 280, y: 552 }, 1)).toEqual({
      blocked: true,
      canLeap: false,
    });
  });

  it("does not block when already somewhere it cannot do worse than", () => {
    // Mid-fall over the void: no direction is any safer, so do not freeze.
    expect(footingAhead(simOn(LEDGE), { x: 500, y: 300 }, 1).blocked).toBe(false);
  });

  it("blocks a step into a kill zone hazard", () => {
    const arena: ArenaDefinition = {
      ...LEDGE,
      solids: [{ x: 0, y: 600, w: 900, h: 40 }],
      hazards: [{ id: "pit", kind: "killZone", box: { x: 400, y: 500, w: 100, h: 200 } }],
    };
    expect(footingAhead(simOn(arena), { x: 350, y: 552 }, 1).blocked).toBe(true);
  });

  it("finds a leap across the gap between Pit's two bridge planks", () => {
    // Standing at the end of the first plank (x 520-620) with the second (x 660-760) ahead.
    const footing = footingAhead(simOn(PIT_ARENA), { x: 600, y: 552 }, 1);
    expect(footing).toEqual({ blocked: true, canLeap: true });
  });

  it("does not treat planks that have already fallen as ground", () => {
    const sim = simOn(PIT_ARENA);
    const fallen = {
      ...sim,
      hazards: {
        ...sim.hazards,
        bridgeA: { ...sim.hazards!.bridgeA!, phase: "fallen", active: false },
        bridgeB: { ...sim.hazards!.bridgeB!, phase: "fallen", active: false },
      },
    };
    // At the left ledge's end, with the whole span gone: nothing to walk on and nothing to leap to.
    expect(footingAhead(fallen, { x: 470, y: 552 }, 1)).toEqual({ blocked: true, canLeap: false });
  });
});

describe("standingOnPlatform", () => {
  it("is true on a one-way platform and false on solid floor", () => {
    expect(standingOnPlatform(simOn(LEDGE), { x: 120, y: 402 })).toBe(true);
    expect(standingOnPlatform(simOn(LEDGE), { x: 120, y: 552 })).toBe(false);
  });
});
