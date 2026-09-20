import { describe, expect, it } from "vitest";
import { ARENA_IDS } from "../types/ids.js";
import { ALL_ARENAS, findArena, getArena, randomArenaId } from "./registry.js";
import { TUTORIAL_ARENA } from "./tutorial.js";

describe("findArena", () => {
  it("finds every real arena by id", () => {
    for (const id of Object.values(ARENA_IDS)) {
      expect(findArena(id)).toBe(getArena(id));
    }
  });

  it("finds the tutorial arena, and nothing else unknown", () => {
    expect(findArena("tutorial")).toBe(TUTORIAL_ARENA);
    expect(findArena("")).toBeUndefined();
    expect(findArena("nowhere")).toBeUndefined();
  });

  it("keeps the tutorial arena out of what players can pick or be dealt", () => {
    expect(ALL_ARENAS).not.toContain(TUTORIAL_ARENA);
    expect(Object.values(ARENA_IDS)).not.toContain("tutorial");
    for (let i = 0; i < 50; i++) {
      expect(randomArenaId(() => i / 50)).not.toBe("tutorial");
    }
  });
});
