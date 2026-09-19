import {
  createSimPlayer,
  getArena,
  MATCH_ROOM_NAME,
  MESSAGE_TYPES,
  encode,
  hashSeed,
  playerId,
} from "@castle-clash/shared";
import { SimHarness } from "@castle-clash/shared/testing";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { server } from "../src/index.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

/** `client.send` hands off to a real transport, which delivers to the room's
 *  `onMessage` handler asynchronously even in-process — flush a macrotask so
 *  the send lands before the (synchronous) ManualTickDriver steps. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("MatchRoom movement", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("matches SimHarness exactly after holding RIGHT for 60 ticks", async () => {
    const tickDriver = new ManualTickDriver();
    const arena = getArena("castleRoom");
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver, arenaId: arena.id });
    connectAs(colyseus, "player-1");
    const client = await colyseus.connectTo(room);

    const RIGHT = encode(["RIGHT"]);
    for (let seq = 1; seq <= 60; seq++) {
      client.send(MESSAGE_TYPES.INPUT, { seq, bits: RIGHT });
      await flush();
      tickDriver.step(1);
    }
    await room.waitForNextPatch();

    const localId = playerId(client.sessionId);
    const spawn = arena.spawns[0]!;
    const harness = new SimHarness({
      tick: 0,
      players: { [localId]: createSimPlayer(spawn) },
      arena,
      rngSeed: hashSeed(room.roomId),
    });
    for (let seq = 1; seq <= 60; seq++) {
      harness.runTick({ [localId]: { seq, bits: RIGHT } });
    }

    const serverPlayer = room.state.players.get(client.sessionId)!;
    const expectedPlayer = harness.state.players[localId]!;
    expect(serverPlayer.x).toBe(expectedPlayer.pos.x);
    expect(serverPlayer.y).toBe(expectedPlayer.pos.y);

    await client.leave();
  });

  it("drops malformed input without crashing the room", async () => {
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver, arenaId: "castleRoom" });
    connectAs(colyseus, "player-1");
    const client = await colyseus.connectTo(room);

    client.send(MESSAGE_TYPES.INPUT, { not: "an input frame" });
    client.send(MESSAGE_TYPES.INPUT, "garbage");
    client.send(MESSAGE_TYPES.INPUT, null);
    await flush();
    tickDriver.step(3);
    await room.waitForNextPatch();

    const serverPlayer = room.state.players.get(client.sessionId)!;
    expect(serverPlayer).toBeDefined();
    expect(Number.isFinite(serverPlayer.x)).toBe(true);

    await client.leave();
  });
});
