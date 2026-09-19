import {
  COUNTDOWN_TICKS,
  DRAFT_TICKS,
  MATCH_ROOM_NAME,
  ROUND_OVER_TICKS,
  ROUNDS_TO_WIN,
} from "@castle-clash/shared";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { CloseCode } from "colyseus";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { server } from "../src/index.js";
import { InMemoryPlayerRepository } from "../src/persistence/InMemoryPlayerRepository.js";
import { MatchRoom } from "../src/rooms/MatchRoom.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { installGracefulShutdown, resetDrainingForTests } from "../src/shutdown.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/** Puts the process into the draining state exactly as a real SIGTERM would
 *  (fake `Drainable` that never finishes, `exit` stubbed out). */
function startDraining(): void {
  let sigterm: (() => void) | undefined;
  installGracefulShutdown(
    { gracefullyShutdown: () => new Promise<void>(() => {}) },
    { onSignal: (handler) => (sigterm = handler), exit: () => {}, drainTimeoutMs: 60_000 },
  );
  sigterm!();
}

function nextLeave(room: ClientRoom): Promise<number> {
  return new Promise((resolve) => {
    room.onLeave((code) => resolve(code));
  });
}

/** Same technique `MatchRoom.auth.test.ts` uses to end a round without a real
 *  fight — dropping a connection counts as an elimination. */
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

describe("MatchRoom graceful shutdown (plan Phase 10 step 1)", () => {
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

  it("releases a room that is still Waiting immediately — no match to protect", async () => {
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver: new ManualTickDriver() });
    connectAs(colyseus, "waiting-player");
    const client = await colyseus.connectTo(room);
    const left = nextLeave(client);

    startDraining();
    room.onBeforeShutdown();

    await expect(left).resolves.toBe(CloseCode.SERVER_SHUTDOWN);
  });

  it("lets an in-progress match finish and record its result before releasing the room", async () => {
    const repo = new InMemoryPlayerRepository();
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
      tickDriver,
      arenaId: "castleRoom",
      playerRepository: repo,
    });
    connectAs(colyseus, "shutdown-winner");
    const winner = await colyseus.connectTo(room);
    connectAs(colyseus, "shutdown-loser");
    let loser = await colyseus.connectTo(room);
    tickDriver.step(1 + COUNTDOWN_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("RoundActive");

    // SIGTERM arrives mid-match.
    startDraining();
    room.onBeforeShutdown();
    let winnerLeft: number | undefined;
    winner.onLeave((code) => {
      winnerLeft = code;
    });
    await flush();
    expect(winnerLeft).toBeUndefined();
    expect(room.state.phase).toBe("RoundActive");

    for (let round = 1; round < ROUNDS_TO_WIN; round++) {
      loser = await endRoundByDropping(colyseus, tickDriver, room, loser);
      tickDriver.step(ROUND_OVER_TICKS);
      await room.waitForNextPatch();
      tickDriver.step(DRAFT_TICKS);
      await room.waitForNextPatch();
      tickDriver.step(COUNTDOWN_TICKS);
      await room.waitForNextPatch();
      expect(winnerLeft).toBeUndefined();
    }

    await loser.leave(false);
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();
    await flush();

    expect(room.state.phase).toBe("MatchOver");
    expect(repo.recordedMatches.size).toBe(1);
    await vi.waitFor(() => expect(winnerLeft).toBe(CloseCode.SERVER_SHUTDOWN));
  }, 10000);
});
