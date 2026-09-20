import { MatchState, PlayerState } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { matchStateToRoomInfo } from "./roomInfo.js";

function addPlayer(state: MatchState, id: string, overrides: Partial<PlayerState> = {}): void {
  const player = new PlayerState();
  player.id = id;
  Object.assign(player, overrides);
  state.players.set(id, player);
}

describe("matchStateToRoomInfo", () => {
  it("maps the room's mode and the standing backfill offer", () => {
    const state = new MatchState();
    state.mode = "quick";
    state.backfillOfferable = true;

    expect(matchStateToRoomInfo(state, null)).toEqual({
      mode: "quick",
      backfillOfferable: true,
      wantsRematch: false,
      humans: 0,
      botIds: [],
    });
  });

  it("counts seated humans, lists bots apart, and leaves spectators out", () => {
    const state = new MatchState();
    addPlayer(state, "me");
    addPlayer(state, "friend");
    addPlayer(state, "watcher", { spectator: true });
    addPlayer(state, "bot-0", { isBot: true });
    addPlayer(state, "bot-1", { isBot: true });

    const info = matchStateToRoomInfo(state, "me");

    expect(info.humans).toBe(2);
    expect(info.botIds).toEqual(["bot-0", "bot-1"]);
  });

  it("reports the local player's own rematch request, not anyone else's", () => {
    const state = new MatchState();
    addPlayer(state, "me");
    addPlayer(state, "friend", { wantsRematch: true });
    expect(matchStateToRoomInfo(state, "me").wantsRematch).toBe(false);

    state.players.get("me")!.wantsRematch = true;
    expect(matchStateToRoomInfo(state, "me").wantsRematch).toBe(true);
  });
});
