import {
  COUNTDOWN_TICKS,
  DRAFT_TICKS,
  guestDisplayName,
  MATCH_ROOM_NAME,
  MESSAGE_TYPES,
  ROUND_OVER_TICKS,
  ROUNDS_TO_WIN,
  type MatchResult,
} from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryPlayerRepository } from "../src/persistence/InMemoryPlayerRepository.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { server } from "../src/index.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("MatchRoom display names", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("gives every client each player's chosen name, or a stable Guest-XXXX label", async () => {
    const repo = new InMemoryPlayerRepository();
    repo.seedDisplayName("named-user", "Sir_Kay");

    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { playerRepository: repo });
    connectAs(colyseus, "named-user");
    const named = await colyseus.connectTo(room);
    connectAs(colyseus, "unnamed-user");
    const unnamed = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    for (const client of [named, unnamed]) {
      expect(client.state.players.get(named.sessionId)!.name).toBe("Sir_Kay");
      expect(client.state.players.get(unnamed.sessionId)!.name).toBe(
        guestDisplayName("unnamed-user"),
      );
    }

    await named.leave();
    await unnamed.leave();
  });

  it("names every participant in the match result, including one who already left", async () => {
    const repo = new InMemoryPlayerRepository();
    repo.seedDisplayName("result-winner", "Sir_Kay");
    repo.seedDisplayName("result-loser", "Sir_Bors");
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
      tickDriver,
      arenaId: "castleRoom",
      playerRepository: repo,
    });

    connectAs(colyseus, "result-winner");
    const winner = await colyseus.connectTo(room);
    connectAs(colyseus, "result-loser");
    let loser = await colyseus.connectTo(room);
    tickDriver.step(1 + COUNTDOWN_TICKS);
    await room.waitForNextPatch();

    const resultMessage = new Promise<MatchResult>((resolve) => {
      winner.onMessage(MESSAGE_TYPES.MATCH_RESULT, (result: MatchResult) => resolve(result));
    });

    for (let round = 1; round < ROUNDS_TO_WIN; round++) {
      const token = loser.reconnectionToken;
      await loser.leave(false);
      await flush();
      tickDriver.step(1);
      await room.waitForNextPatch();
      loser = await colyseus.sdk.reconnect(token);
      tickDriver.step(ROUND_OVER_TICKS);
      await room.waitForNextPatch();
      tickDriver.step(DRAFT_TICKS);
      await room.waitForNextPatch();
      tickDriver.step(COUNTDOWN_TICKS);
      await room.waitForNextPatch();
    }
    // The last drop ends the match with the loser already gone from the room.
    await loser.leave(false);
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();
    await flush();

    const result = await resultMessage;
    expect(Object.values(result.names ?? {}).sort()).toEqual(["Sir_Bors", "Sir_Kay"]);
    expect(result.names?.[result.winner!]).toBe("Sir_Kay");

    await winner.leave();
  }, 10000);

  it("still lets a player join, under their guest label, when the name lookup fails", async () => {
    const repo = new InMemoryPlayerRepository();
    repo.getDisplayName = async () => {
      throw new Error("profiles unavailable");
    };

    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { playerRepository: repo });
    connectAs(colyseus, "flaky-user");
    const client = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    expect(client.state.players.get(client.sessionId)!.name).toBe(guestDisplayName("flaky-user"));

    await client.leave();
  });
});
