import { MATCH_ROOM_NAME, MESSAGE_TYPES } from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";

describe("matchmaking", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("quick play never lands in a private room", async () => {
    const privateRoom = await colyseus.sdk.create(MATCH_ROOM_NAME, { mode: "private" });
    await privateRoom.leave();

    const quickRoom = await colyseus.sdk.joinOrCreate(MATCH_ROOM_NAME, { mode: "quick" });
    expect(quickRoom.roomId).not.toBe(privateRoom.roomId);
    await quickRoom.leave();
  });

  it("a wrong private code can't join an existing private room", async () => {
    const creator = await colyseus.sdk.create(MATCH_ROOM_NAME, { mode: "private" });
    const code: string = await creator.waitForMessage(MESSAGE_TYPES.MATCH_CODE);
    expect(code).toHaveLength(6);

    await expect(
      colyseus.sdk.join(MATCH_ROOM_NAME, { mode: "private", code: "ZZZZZZ" }),
    ).rejects.toBeDefined();

    const joiner = await colyseus.sdk.join(MATCH_ROOM_NAME, { mode: "private", code });
    expect(joiner.roomId).toBe(creator.roomId);

    await creator.leave();
    await joiner.leave();
  });

  it("two private rooms with different codes never cross-join", async () => {
    const roomA = await colyseus.sdk.create(MATCH_ROOM_NAME, { mode: "private" });
    const codeA: string = await roomA.waitForMessage(MESSAGE_TYPES.MATCH_CODE);
    const roomB = await colyseus.sdk.create(MATCH_ROOM_NAME, { mode: "private" });
    const codeB: string = await roomB.waitForMessage(MESSAGE_TYPES.MATCH_CODE);
    expect(codeA).not.toBe(codeB);

    const joinerA = await colyseus.sdk.join(MATCH_ROOM_NAME, { mode: "private", code: codeA });
    expect(joinerA.roomId).toBe(roomA.roomId);

    await roomA.leave();
    await roomB.leave();
    await joinerA.leave();
  });
});
