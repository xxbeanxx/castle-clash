import { MATCH_ROOM_NAME, MAX_PLAYERS } from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";
import { installGracefulShutdown, resetDrainingForTests, type Drainable } from "../src/shutdown.js";
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

  afterEach(() => {
    resetDrainingForTests();
  });

  it("rejects new room creation once the server starts draining (plan Phase 10 step 1)", async () => {
    const fakeDrainable: Drainable = { gracefullyShutdown: () => new Promise<void>(() => {}) };
    let sigtermHandler: (() => void) | undefined;
    installGracefulShutdown(fakeDrainable, {
      onSignal: (handler) => {
        sigtermHandler = handler;
      },
      exit: () => {},
    });

    sigtermHandler!();

    await expect(colyseus.createRoom(MATCH_ROOM_NAME)).rejects.toBeDefined();
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

  it("caps a room at MAX_PLAYERS — the next quick-play join gets a new room, not a 7th seat", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);
    const clients = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      connectAs(colyseus, `cap-player-${i}`);
      clients.push(await colyseus.connectTo(room));
    }

    connectAs(colyseus, "cap-player-overflow");
    await expect(colyseus.connectTo(room)).rejects.toBeDefined();

    for (const client of clients) {
      await client.leave();
    }
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
