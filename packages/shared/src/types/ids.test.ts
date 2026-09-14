import { describe, expect, it } from "vitest";
import { ARENA_IDS, isArenaId, isWeaponId, playerId, roomId, WEAPON_IDS } from "./ids.js";

describe("branded ids", () => {
  it("playerId and roomId pass their raw string through at runtime", () => {
    expect(playerId("p1")).toBe("p1" as unknown);
    expect(roomId("r1")).toBe("r1" as unknown);
  });
});

describe("WeaponId", () => {
  it("lists exactly sword, mace, spear", () => {
    expect(Object.values(WEAPON_IDS).sort()).toEqual(["mace", "spear", "sword"]);
  });

  it("isWeaponId narrows valid and rejects invalid values", () => {
    expect(isWeaponId("sword")).toBe(true);
    expect(isWeaponId("bow")).toBe(false);
  });
});

describe("ArenaId", () => {
  it("lists exactly six arenas", () => {
    expect(Object.values(ARENA_IDS)).toHaveLength(6);
  });

  it("isArenaId narrows valid and rejects invalid values", () => {
    for (const id of Object.values(ARENA_IDS)) {
      expect(isArenaId(id)).toBe(true);
    }
    expect(isArenaId("nonexistent")).toBe(false);
  });
});
