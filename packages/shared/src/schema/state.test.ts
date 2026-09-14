import { describe, expect, it } from "vitest";
import { MatchState, PlayerState } from "./state.js";

describe("PlayerState", () => {
  it("defaults id, position, and colorSeed to empty/zero", () => {
    const player = new PlayerState();
    expect(player.id).toBe("");
    expect(player.x).toBe(0);
    expect(player.y).toBe(0);
    expect(player.colorSeed).toBe(0);
  });

  it("holds assigned values", () => {
    const player = new PlayerState();
    player.id = "abc123";
    player.x = 42;
    player.y = -7;
    player.colorSeed = 0xff00ff;
    expect(player).toMatchObject({ id: "abc123", x: 42, y: -7, colorSeed: 0xff00ff });
  });
});

describe("MatchState", () => {
  it("defaults tick to 0 and players to an empty map", () => {
    const state = new MatchState();
    expect(state.tick).toBe(0);
    expect(state.players.size).toBe(0);
  });

  it("tracks players added and removed by id", () => {
    const state = new MatchState();
    const player = new PlayerState();
    player.id = "p1";

    state.players.set(player.id, player);
    expect(state.players.size).toBe(1);
    expect(state.players.get("p1")).toBe(player);

    state.players.delete("p1");
    expect(state.players.size).toBe(0);
  });
});
