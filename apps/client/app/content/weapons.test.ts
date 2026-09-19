import { WEAPON_IDS, WEAPONS } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { ARENA_LABELS, hazardSummary } from "./arenas.js";
import { weaponFacts } from "./weapons.js";
import { ALL_ARENAS, ARENAS } from "@castle-clash/shared";

describe("weapon copy stays true to the frame data", () => {
  const defs = Object.values(WEAPONS);

  it("the spear has the longest reach", () => {
    const longest = defs.reduce((a, b) => (b.reach > a.reach ? b : a));
    expect(longest.id).toBe(WEAPON_IDS.SPEAR);
  });

  it("the mace's heavy does the most stamina damage", () => {
    const crushing = defs.reduce((a, b) => (b.heavy.staminaDamage > a.heavy.staminaDamage ? b : a));
    expect(crushing.id).toBe(WEAPON_IDS.MACE);
  });

  it("only the sword chains two light strikes", () => {
    expect(WEAPONS[WEAPON_IDS.SWORD].lightChainLimit).toBe(2);
    expect(WEAPONS[WEAPON_IDS.MACE].lightChainLimit).toBe(1);
    expect(WEAPONS[WEAPON_IDS.SPEAR].lightChainLimit).toBe(1);
  });

  it("lists every weapon", () => {
    expect(weaponFacts().map((weapon) => weapon.id)).toEqual(Object.values(WEAPON_IDS));
  });
});

describe("arena content", () => {
  it("names every arena", () => {
    for (const id of Object.keys(ARENAS)) {
      expect(ARENA_LABELS[id as keyof typeof ARENA_LABELS]).toBeTruthy();
    }
  });

  it("gives every arena at least one hazard (the landing page says so)", () => {
    for (const arena of ALL_ARENAS) {
      expect(hazardSummary(arena).length, arena.id).toBeGreaterThan(0);
    }
  });

  it("summarises each arena's hazards from its definition, without duplicates", () => {
    for (const arena of ALL_ARENAS) {
      const summary = hazardSummary(arena);
      expect(new Set(summary).size).toBe(summary.length);
      expect(summary.length === 0).toBe(arena.hazards.length === 0);
    }
  });
});
