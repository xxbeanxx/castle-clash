import { MATCH_ROOM_NAME, MESSAGE_TYPES } from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { server } from "../src/index.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

function nextLeave(room: { onLeave: (cb: (code: number) => void) => unknown }): Promise<number> {
  return new Promise((resolve) => {
    room.onLeave((code) => resolve(code));
  });
}

describe("MatchRoom abuse guardrails (plan Phase 10 step 1)", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("kicks a client that keeps flooding past the input rate limit", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);
    connectAs(colyseus, "flooder");
    const client = await colyseus.connectTo(room);
    const left = nextLeave(client);

    // 120/s budget, then 30 consecutive drops trigger the kick — 400
    // back-to-back messages comfortably exceeds both.
    for (let i = 0; i < 400; i++) {
      client.send(MESSAGE_TYPES.INPUT, { seq: i, bits: 0 });
    }

    await expect(left).resolves.toBe(4008);
  });

  it("does not kick a client that stays under the rate limit", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);
    connectAs(colyseus, "polite");
    const client = await colyseus.connectTo(room);
    let kicked = false;
    client.onLeave((code) => {
      if (code === 4008) {
        kicked = true;
      }
    });

    for (let i = 0; i < 20; i++) {
      client.send(MESSAGE_TYPES.INPUT, { seq: i, bits: 0 });
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(kicked).toBe(false);
    await client.leave();
  });

  it("closes the connection on a message over the max payload size", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);
    connectAs(colyseus, "big-messenger");
    const client = await colyseus.connectTo(room);
    const left = nextLeave(client);

    client.send(MESSAGE_TYPES.INPUT, { seq: 1, bits: 0, junk: "x".repeat(16 * 1024) });

    // 1009 = "message too big" per RFC 6455.
    await expect(left).resolves.toBe(1009);
  });

  it("rejects a user joining too many times within the window", async () => {
    // A fresh room per attempt: Colyseus auto-disposes a room once its last
    // client leaves, and the limiter is module-scoped across rooms anyway —
    // which is exactly the property under test.
    for (let i = 0; i < 10; i++) {
      const room = await colyseus.createRoom(MATCH_ROOM_NAME);
      connectAs(colyseus, "join-spammer");
      const client = await colyseus.connectTo(room);
      await client.leave();
    }

    const room = await colyseus.createRoom(MATCH_ROOM_NAME);
    connectAs(colyseus, "join-spammer");
    await expect(colyseus.connectTo(room)).rejects.toBeDefined();
  });

  it("rejects new room creation at the per-process room cap", async () => {
    vi.stubEnv("MAX_ROOMS_PER_PROCESS", "0");
    await expect(colyseus.createRoom(MATCH_ROOM_NAME)).rejects.toBeDefined();
  });
});
