import { COUNTDOWN_TICKS, MATCH_ROOM_NAME } from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";

/** `leave(false)` closing the raw socket resolves on the client's own
 *  'close' event, which can race the server's `_onLeave`/`onDrop` handling
 *  of that same close — give the server a macrotask to process it. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("MatchRoom reconnect", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("restores the same PlayerId when a dropped client reconnects within the window", async () => {
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver });

    const a = await colyseus.connectTo(room);
    const b = await colyseus.connectTo(room);
    tickDriver.step(1);
    await room.waitForNextPatch();
    const originalSessionId = b.sessionId;
    const reconnectionToken = b.reconnectionToken;

    // `leave(false)` closes the raw connection instead of sending the
    // consented LEAVE_ROOM protocol message — the server sees an abrupt
    // drop, which is what should trigger `onDrop`/`allowReconnection`.
    await b.leave(false);
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.players.get(originalSessionId)).toBeDefined();

    const reconnected = await colyseus.sdk.reconnect(reconnectionToken);
    expect(reconnected.sessionId).toBe(originalSessionId);

    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);

    await a.leave();
    await reconnected.leave();
  });

  it("counts a drop during RoundActive as an elimination for the current round but keeps the seat", async () => {
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver });

    const a = await colyseus.connectTo(room);
    const b = await colyseus.connectTo(room);
    tickDriver.step(1 + COUNTDOWN_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("RoundActive");

    await b.leave(false);
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();

    expect(room.state.phase).toBe("RoundOver");
    expect(room.state.players.get(a.sessionId)!.roundsWon).toBe(1);
    // The seat is still reserved — the player entry hasn't been removed.
    expect(room.state.players.get(b.sessionId)).toBeDefined();

    await a.leave();
  });
});
