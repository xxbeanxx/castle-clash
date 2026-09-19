import { describe, expect, it } from "vitest";
import type { KillZoneDef } from "./types.js";
import { createHazardState, stepHazards } from "./step.js";

const BOX = { x: 0, y: 900, w: 400, h: 200 };

describe("KillZone (hazard-authored)", () => {
  it("is always active and contributes its box to killZoneBoxes", () => {
    const def: KillZoneDef = { id: "pit", kind: "killZone", box: BOX };
    const hazards = [def];
    const result = stepHazards({
      tick: 1,
      hazards,
      prevState: createHazardState(hazards),
      players: {},
      landedIds: new Set(),
    });
    expect(result.state["pit"]!.active).toBe(true);
    expect(result.killZoneBoxes).toContainEqual(BOX);
  });
});
