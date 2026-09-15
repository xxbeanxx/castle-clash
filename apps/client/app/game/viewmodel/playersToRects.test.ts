import { MatchState, PlayerState } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { playersToRects } from "./playersToRects.js";

function addPlayer(state: MatchState, id: string, x: number, y: number, colorSeed: number): void {
  const player = new PlayerState();
  player.id = id;
  player.x = x;
  player.y = y;
  player.colorSeed = colorSeed;
  state.players.set(id, player);
}

describe("playersToRects", () => {
  it("returns an empty array for an empty state", () => {
    expect(playersToRects(new MatchState())).toEqual([]);
  });

  it("maps each player to a rect carrying its id, position, tint, and action", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 10, 20, 0xff00ff);

    expect(playersToRects(state)).toEqual([
      { id: "p1", x: 10, y: 20, tint: 0xff00ff, action: "Idle" },
    ]);
  });

  it("carries the player's current action through", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 1);
    state.players.get("p1")!.action = "Block";

    expect(playersToRects(state)[0]?.action).toBe("Block");
  });

  it("gives the same tint for the same colorSeed across separate calls", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 12345);

    const [first] = playersToRects(state);
    const [second] = playersToRects(state);

    expect(first?.tint).toBe(second?.tint);
  });

  it("substitutes a position override for a player when one is given", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 10, 20, 0xff00ff);

    expect(playersToRects(state, { p1: { x: 99, y: 88 } })).toEqual([
      { id: "p1", x: 99, y: 88, tint: 0xff00ff, action: "Idle" },
    ]);
  });

  it("falls back to schema position for a player with no override", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 10, 20, 1);
    addPlayer(state, "p2", 30, 40, 2);

    expect(playersToRects(state, { p1: { x: 99, y: 88 } })).toEqual([
      { id: "p1", x: 99, y: 88, tint: 1, action: "Idle" },
      { id: "p2", x: 30, y: 40, tint: 2, action: "Idle" },
    ]);
  });

  it("omits players who are no longer in state", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 1);
    addPlayer(state, "p2", 5, 5, 2);

    state.players.delete("p1");

    expect(playersToRects(state).map((rect) => rect.id)).toEqual(["p2"]);
  });
});
