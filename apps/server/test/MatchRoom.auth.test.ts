import { COUNTDOWN_TICKS, DRAFT_TICKS, MATCH_ROOM_NAME, ROUND_OVER_TICKS, ROUNDS_TO_WIN } from "@castle-clash/shared";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InMemoryPlayerRepository } from "../src/persistence/InMemoryPlayerRepository.js";
import { MatchRoom } from "../src/rooms/MatchRoom.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { server } from "../src/index.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

/** `leave(false)` closing the raw socket (not the consented LEAVE_ROOM
 *  message) is what triggers `onDrop`/`eliminateByDisconnect` — same
 *  technique `MatchRoom.reconnect.test.ts` uses to end a round without a
 *  real fight. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/** Ends the current round by dropping `loser`'s connection (counts as an
 *  elimination — plan step 3), then reconnects them so the match can keep
 *  going into the next round on the same seat. Returns the reconnected
 *  client, since `leave()`d clients can't be reused. */
async function endRoundByDropping(
  colyseus: ColyseusTestServer,
  tickDriver: ManualTickDriver,
  room: MatchRoom,
  loser: ClientRoom,
): Promise<ClientRoom> {
  const reconnectionToken = loser.reconnectionToken;
  await loser.leave(false);
  await flush();
  tickDriver.step(1);
  await room.waitForNextPatch();
  return colyseus.sdk.reconnect(reconnectionToken);
}

/** RoundOver -> Draft (timeout auto-pick, no client sends a pick) ->
 *  Countdown -> RoundActive, the same tick counts `MatchRoom.draft.test.ts`
 *  uses. */
async function advanceThroughDraftToNextRound(tickDriver: ManualTickDriver, room: MatchRoom): Promise<void> {
  tickDriver.step(ROUND_OVER_TICKS);
  await room.waitForNextPatch();
  tickDriver.step(DRAFT_TICKS);
  await room.waitForNextPatch();
  tickDriver.step(COUNTDOWN_TICKS);
  await room.waitForNextPatch();
}

describe("MatchRoom auth", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    // The "repository always throws" test below would otherwise wait out
    // `enqueueRecordMatch`'s real exponential backoff (seconds) to observe
    // it give up — see `MatchRoom.recordMatchDelay`'s doc comment.
    MatchRoom.recordMatchDelay = async () => {};
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeEach(() => {
    colyseus.sdk.auth.token = undefined as unknown as string;
  });

  it("rejects a join with no auth token", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);
    await expect(colyseus.connectTo(room)).rejects.toBeDefined();
  });

  it("rejects a second join attempt from the same authenticated user", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME);

    connectAs(colyseus, "same-user");
    const first = await colyseus.connectTo(room);

    connectAs(colyseus, "same-user");
    await expect(colyseus.connectTo(room)).rejects.toBeDefined();

    await first.leave();
  });

  it(
    "calls repo.recordMatch exactly once with the match's aggregates once MatchOver is reached",
    async () => {
      const repo = new InMemoryPlayerRepository();
      const tickDriver = new ManualTickDriver();
      const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
        tickDriver,
        arenaId: "castleRoom",
        playerRepository: repo,
      });

      connectAs(colyseus, "winner-user");
      const winner = await colyseus.connectTo(room);
      connectAs(colyseus, "loser-user");
      let loser = await colyseus.connectTo(room);
      tickDriver.step(1 + COUNTDOWN_TICKS);
      await room.waitForNextPatch();
      expect(room.state.phase).toBe("RoundActive");

      for (let round = 1; round < ROUNDS_TO_WIN; round++) {
        loser = await endRoundByDropping(colyseus, tickDriver, room, loser);
        expect(room.state.phase).toBe("RoundOver");
        await advanceThroughDraftToNextRound(tickDriver, room);
        expect(room.state.phase).toBe("RoundActive");
      }

      // Final round: drop the loser one more time to reach MatchOver.
      await loser.leave(false);
      await flush();
      tickDriver.step(1);
      await room.waitForNextPatch();
      await flush(); // let the fire-and-forget enqueueRecordMatch() settle

      expect(room.state.phase).toBe("MatchOver");
      expect(repo.recordedMatches.size).toBe(1);
      const [record] = [...repo.recordedMatches.values()];
      expect(record!.winnerId).toBe("winner-user");
      expect(record!.participants).toHaveLength(2);
      const winnerParticipant = record!.participants.find((p) => p.playerId === "winner-user");
      expect(winnerParticipant?.placement).toBe(1);
      expect(winnerParticipant?.roundsWon).toBe(ROUNDS_TO_WIN);

      await winner.leave();
    },
    10000,
  );

  it("still reaches MatchOver and disposes cleanly when the repository always throws", async () => {
    const repo = new InMemoryPlayerRepository();
    repo.recordMatch = async () => {
      throw new Error("simulated persistence outage");
    };
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
      tickDriver,
      arenaId: "castleRoom",
      playerRepository: repo,
    });

    connectAs(colyseus, "winner-user-2");
    const winner = await colyseus.connectTo(room);
    connectAs(colyseus, "loser-user-2");
    let loser = await colyseus.connectTo(room);
    tickDriver.step(1 + COUNTDOWN_TICKS);
    await room.waitForNextPatch();

    for (let round = 1; round < ROUNDS_TO_WIN; round++) {
      loser = await endRoundByDropping(colyseus, tickDriver, room, loser);
      await advanceThroughDraftToNextRound(tickDriver, room);
    }

    await loser.leave(false);
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();

    // The room reached MatchOver despite the repository rejecting every
    // call — `enqueueRecordMatch` is fire-and-forget and never throws into
    // the tick loop (plan step 5: "never crash the room").
    expect(room.state.phase).toBe("MatchOver");

    await winner.leave();
  });
});
