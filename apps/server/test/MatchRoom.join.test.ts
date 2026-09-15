import { MATCH_ROOM_NAME } from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";

describe("MatchRoom join/leave", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("adds a player to state on join and removes it on leave", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);

    const client1 = await colyseus.connectTo(room);
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);

    const client2 = await colyseus.connectTo(room);
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);

    await client1.leave();
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);

    await client2.leave();
  });
});
