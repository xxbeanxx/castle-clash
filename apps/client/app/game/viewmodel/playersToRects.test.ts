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

  it("maps each player to a rect carrying its id, position, and a tint from colorSeed", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 10, 20, 0xff00ff);

    expect(playersToRects(state)).toEqual([{ id: "p1", x: 10, y: 20, tint: 0xff00ff }]);
  });

  it("gives the same tint for the same colorSeed across separate calls", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 12345);

    const [first] = playersToRects(state);
    const [second] = playersToRects(state);

    expect(first?.tint).toBe(second?.tint);
  });

  it("omits players who are no longer in state", () => {
    const state = new MatchState();
    addPlayer(state, "p1", 0, 0, 1);
    addPlayer(state, "p2", 5, 5, 2);

    state.players.delete("p1");

    expect(playersToRects(state).map((rect) => rect.id)).toEqual(["p2"]);
  });
});
