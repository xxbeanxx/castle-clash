import {
  COUNTDOWN_TICKS,
  MATCH_ROOM_NAME,
  ROUND_TIME_LIMIT,
  TICK_RATE,
} from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

describe("MatchRoom sudden death", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("ends a round that two players never fight in: past the time limit both bleed until it is over", async () => {
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver, arenaId: "castleRoom" });

    connectAs(colyseus, "sd-a");
    await colyseus.connectTo(room);
    connectAs(colyseus, "sd-b");
    await colyseus.connectTo(room);

    tickDriver.step(1 + COUNTDOWN_TICKS + 1);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.suddenDeathTicks).toBe(0);

    tickDriver.step(ROUND_TIME_LIMIT + 60);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.suddenDeathTicks).toBeGreaterThan(0);
    const bleeding = [...room.state.players.values()].every((player) => player.hp < 100);
    expect(bleeding).toBe(true);

    tickDriver.step(20 * TICK_RATE);
    await room.waitForNextPatch();
    expect(room.state.phase).not.toBe("RoundActive");
    expect(room.state.suddenDeathTicks).toBe(0);
  });
});
