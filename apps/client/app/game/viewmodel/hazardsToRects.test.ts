import { HazardState, MatchState } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { hazardsToRects } from "./hazardsToRects.js";

function addHazard(
  state: MatchState,
  id: string,
  kind: string,
  active: boolean,
  phase: string,
): void {
  const hazard = new HazardState();
  hazard.id = id;
  hazard.kind = kind;
  hazard.active = active;
  hazard.phase = phase;
  state.hazards.set(id, hazard);
}

const FLOOR_DEF = {
  id: "floor",
  kind: "breakableFloor" as const,
  box: { x: 10, y: 20, w: 100, h: 16 },
  hp: 16,
  breakOn: "heavy" as const,
  respawnPerRound: true,
};

describe("hazardsToRects", () => {
  it("returns an empty array when there are no synced hazards", () => {
    expect(hazardsToRects(new MatchState(), [FLOOR_DEF])).toEqual([]);
  });

  it("maps a synced hazard to a rect using the matching def's box geometry", () => {
    const state = new MatchState();
    addHazard(state, "floor", "breakableFloor", true, "solid");

    expect(hazardsToRects(state, [FLOOR_DEF])).toEqual([
      {
        id: "floor",
        kind: "breakableFloor",
        x: 10,
        y: 20,
        w: 100,
        h: 16,
        active: true,
        phase: "solid",
        hp: 0,
        maxHp: 16,
      },
    ]);
  });

  it("skips a synced hazard with no matching static def", () => {
    const state = new MatchState();
    addHazard(state, "unknown", "fireZone", true, "on");

    expect(hazardsToRects(state, [FLOOR_DEF])).toEqual([]);
  });

  it("carries active/phase through as they change", () => {
    const state = new MatchState();
    addHazard(state, "floor", "breakableFloor", false, "broken");

    const [rect] = hazardsToRects(state, [FLOOR_DEF]);
    expect(rect?.active).toBe(false);
    expect(rect?.phase).toBe("broken");
  });
});
