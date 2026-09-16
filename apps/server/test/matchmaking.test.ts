import { MATCH_ROOM_NAME, MESSAGE_TYPES } from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

describe("matchmaking", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("quick play never lands in a private room", async () => {
    connectAs(colyseus, "quick-play-solo");
    const privateRoom = await colyseus.sdk.create(MATCH_ROOM_NAME, { mode: "private" });
    await privateRoom.leave();

    connectAs(colyseus, "quick-play-solo");
    const quickRoom = await colyseus.sdk.joinOrCreate(MATCH_ROOM_NAME, { mode: "quick" });
    expect(quickRoom.roomId).not.toBe(privateRoom.roomId);
    await quickRoom.leave();
  });

  it("a wrong private code can't join an existing private room", async () => {
    connectAs(colyseus, "private-code-creator");
    const creator = await colyseus.sdk.create(MATCH_ROOM_NAME, { mode: "private" });
    const code: string = await creator.waitForMessage(MESSAGE_TYPES.MATCH_CODE);
    expect(code).toHaveLength(6);

    connectAs(colyseus, "private-code-wrong-guesser");
    await expect(
      colyseus.sdk.join(MATCH_ROOM_NAME, { mode: "private", code: "ZZZZZZ" }),
    ).rejects.toBeDefined();

    connectAs(colyseus, "private-code-joiner");
    const joiner = await colyseus.sdk.join(MATCH_ROOM_NAME, { mode: "private", code });
    expect(joiner.roomId).toBe(creator.roomId);

    await creator.leave();
    await joiner.leave();
  });

  it("two private rooms with different codes never cross-join", async () => {
    connectAs(colyseus, "two-rooms-creator-a");
    const roomA = await colyseus.sdk.create(MATCH_ROOM_NAME, { mode: "private" });
    const codeA: string = await roomA.waitForMessage(MESSAGE_TYPES.MATCH_CODE);
    connectAs(colyseus, "two-rooms-creator-b");
    const roomB = await colyseus.sdk.create(MATCH_ROOM_NAME, { mode: "private" });
    const codeB: string = await roomB.waitForMessage(MESSAGE_TYPES.MATCH_CODE);
    expect(codeA).not.toBe(codeB);

    connectAs(colyseus, "two-rooms-joiner-a");
    const joinerA = await colyseus.sdk.join(MATCH_ROOM_NAME, { mode: "private", code: codeA });
    expect(joinerA.roomId).toBe(roomA.roomId);

    await roomA.leave();
    await roomB.leave();
    await joinerA.leave();
  });
});
