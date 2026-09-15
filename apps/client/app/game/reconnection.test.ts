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
