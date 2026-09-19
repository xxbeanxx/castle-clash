import { MatchState, PlayerState } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { matchStateToHud } from "./hud.js";

function addPlayer(
  state: MatchState,
  id: string,
  overrides: Partial<Pick<PlayerState, "hp" | "stamina" | "weapon" | "action">> = {},
): void {
  const player = new PlayerState();
  player.id = id;
  Object.assign(player, overrides);
  state.players.set(id, player);
}

describe("matchStateToHud", () => {
  it("returns an empty array for an empty state", () => {
    expect(matchStateToHud(new MatchState(), null)).toEqual([]);
  });

  it("maps each player's hp/stamina/weapon/action and marks the local one", () => {
    const state = new MatchState();
    addPlayer(state, "p1", { hp: 80, stamina: 50, weapon: "sword", action: "Block" });

    expect(matchStateToHud(state, "p1")).toEqual([
      { id: "p1", isLocal: true, hp: 80, stamina: 50, weapon: "sword", action: "Block", powerups: [] },
    ]);
  });

  it("maps owned power-up stacks", () => {
    const state = new MatchState();
    addPlayer(state, "p1");
    state.players.get("p1")!.powerups.push("sharpEdge", "sharpEdge");

    expect(matchStateToHud(state, "p1")[0]?.powerups).toEqual(["sharpEdge", "sharpEdge"]);
  });

  it("marks a non-matching id as not local", () => {
    const state = new MatchState();
    addPlayer(state, "p1");

    expect(matchStateToHud(state, "someone-else")[0]?.isLocal).toBe(false);
  });

  it("sorts the local player first", () => {
    const state = new MatchState();
    addPlayer(state, "opponent");
    addPlayer(state, "me");

    expect(matchStateToHud(state, "me").map((s) => s.id)).toEqual(["me", "opponent"]);
  });
});
