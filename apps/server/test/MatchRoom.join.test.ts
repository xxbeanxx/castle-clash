import { MATCH_ROOM_NAME } from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

describe("MatchRoom join/leave", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("adds a player to state on join and removes it on leave", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);

    connectAs(colyseus, "player-1");
    const client1 = await colyseus.connectTo(room);
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);

    connectAs(colyseus, "player-2");
    const client2 = await colyseus.connectTo(room);
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);

    await client1.leave();
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);

    await client2.leave();
  });

  it("rejects a second join attempt from the same authenticated user", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);

    connectAs(colyseus, "duplicate-user");
    const client1 = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    connectAs(colyseus, "duplicate-user");
    await expect(colyseus.connectTo(room)).rejects.toBeDefined();

    await client1.leave();
  });
});
