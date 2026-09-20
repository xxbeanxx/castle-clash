import { afterEach, describe, expect, it } from "vitest";
import { resolveJoinIntent, storeReconnectionToken } from "./reconnection.js";

describe("resolveJoinIntent", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("resolves 'new' with no mode to quick play", () => {
    expect(resolveJoinIntent("new", new URLSearchParams())).toEqual({ kind: "quick" });
  });

  it("resolves 'new' with mode=private and no code to creating one", () => {
    expect(resolveJoinIntent("new", new URLSearchParams("mode=private"))).toEqual({
      kind: "createPrivate",
    });
  });

  it("resolves 'new' with mode=private and an arena to creating one with that arena", () => {
    expect(resolveJoinIntent("new", new URLSearchParams("mode=private&arena=pit"))).toEqual({
      kind: "createPrivate",
      arenaId: "pit",
    });
  });

  it("ignores arena when a code is also present — joining inherits the host's arena", () => {
    expect(
      resolveJoinIntent("new", new URLSearchParams("mode=private&code=ABC123&arena=pit")),
    ).toEqual({ kind: "joinPrivate", code: "ABC123" });
  });

  it("resolves 'new' with mode=private and a code to joining by code", () => {
    expect(resolveJoinIntent("new", new URLSearchParams("mode=private&code=ABC123"))).toEqual({
      kind: "joinPrivate",
      code: "ABC123",
    });
  });

  it("resolves a real roomId with no stored token to joinById", () => {
    expect(resolveJoinIntent("room-42", new URLSearchParams())).toEqual({
      kind: "joinById",
      roomId: "room-42",
    });
  });

  it("prefers a stored reconnection token for a real roomId", () => {
    storeReconnectionToken("room-42", "token-abc");
    expect(resolveJoinIntent("room-42", new URLSearchParams())).toEqual({
      kind: "reconnect",
      token: "token-abc",
    });
  });
});

describe("resolveJoinIntent — practice", () => {
  it("resolves mode=practice to a practice intent carrying bots, tier and arena", () => {
    expect(
      resolveJoinIntent("new", new URLSearchParams("mode=practice&bots=2&tier=hard&arena=pit")),
    ).toEqual({ kind: "practice", botCount: 2, tier: "hard", arenaId: "pit" });
  });

  it("defaults to one normal bot on a random arena", () => {
    expect(resolveJoinIntent("new", new URLSearchParams("mode=practice"))).toEqual({
      kind: "practice",
      botCount: 1,
      tier: "normal",
      arenaId: undefined,
    });
  });

  it.each([
    ["0", 1],
    ["-3", 1],
    ["9", 3],
    ["two", 1],
  ])(
    "clamps bots=%s to %i (the server clamps again; this keeps the URL honest)",
    (bots, expected) => {
      const intent = resolveJoinIntent("new", new URLSearchParams(`mode=practice&bots=${bots}`));
      expect(intent).toMatchObject({ kind: "practice", botCount: expected });
    },
  );
});

describe("resolveJoinIntent — tutorial", () => {
  it("resolves mode=tutorial to the tutorial room", () => {
    expect(resolveJoinIntent("new", new URLSearchParams("mode=tutorial&next=%2Flobby"))).toEqual({
      kind: "tutorial",
    });
  });
});
