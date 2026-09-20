import {
  BACKFILL_OFFER_TICKS,
  COUNTDOWN_TICKS,
  DRAFT_TICKS,
  MATCH_ROOM_NAME,
  MAX_HP,
  MESSAGE_TYPES,
  ROUND_OVER_TICKS,
  ROUNDS_TO_WIN,
  type MatchResult,
} from "@castle-clash/shared";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";
import type { MatchRoom } from "../src/rooms/MatchRoom.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { InMemoryPlayerRepository } from "../src/persistence/InMemoryPlayerRepository.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

function flush(): Promise<void> {
  // Long enough for a message sent a moment ago to reach the server even when the machine is busy
  // (the whole workspace's tests run in parallel under `pnpm verify`).
  return new Promise((resolve) => setTimeout(resolve, 25));
}

/** Steps the room until `predicate` holds (or fails after `maxTicks`), a minute of ticks at a time. */
async function stepUntil(
  tickDriver: ManualTickDriver,
  predicate: () => boolean,
  maxTicks = 30_000,
): Promise<void> {
  for (let ticks = 0; ticks < maxTicks && !predicate(); ticks += 30) {
    tickDriver.step(30);
  }
  await flush();
  if (!predicate()) {
    throw new Error(`condition not reached within ${maxTicks} ticks`);
  }
}

/** Ends the round by dropping `loser`'s socket (an elimination), then reconnects them so the match
 *  goes on. The same technique `MatchRoom.auth.test.ts` uses to finish a match without a real fight. */
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

/** Two humans, no fight: `loser` is dropped in every round, and reconnected once the match is over. */
async function playHumansToMatchOver(
  colyseus: ColyseusTestServer,
  tickDriver: ManualTickDriver,
  room: MatchRoom,
  loser: ClientRoom,
): Promise<ClientRoom> {
  tickDriver.step(COUNTDOWN_TICKS + 1);
  await room.waitForNextPatch();
  for (let round = 1; round < ROUNDS_TO_WIN; round++) {
    loser = await endRoundByDropping(colyseus, tickDriver, room, loser);
    tickDriver.step(ROUND_OVER_TICKS);
    tickDriver.step(DRAFT_TICKS);
    tickDriver.step(COUNTDOWN_TICKS);
    await room.waitForNextPatch();
  }
  return endRoundByDropping(colyseus, tickDriver, room, loser);
}

const botsIn = (room: MatchRoom) => [...room.state.players.values()].filter((p) => p.isBot);
const humansIn = (room: MatchRoom) => [...room.state.players.values()].filter((p) => !p.isBot);

describe("MatchRoom bots", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  describe("practice", () => {
    async function practiceRoom(options: Record<string, unknown> = {}) {
      const tickDriver = new ManualTickDriver();
      const repo = new InMemoryPlayerRepository();
      const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
        tickDriver,
        playerRepository: repo,
        arenaId: "castleRoom",
        mode: "practice",
        ...options,
      });
      return { tickDriver, repo, room };
    }

    it("seats the requested bots beside the one human, flagged and named, and starts the match by itself", async () => {
      const { tickDriver, room } = await practiceRoom({ botCount: 2, botTier: "easy" });
      connectAs(colyseus, "solo-1");
      await colyseus.connectTo(room);
      await flush();

      expect(room.state.mode).toBe("practice");
      expect(botsIn(room)).toHaveLength(2);
      expect(humansIn(room)).toHaveLength(1);
      for (const bot of botsIn(room)) {
        expect(bot.name.length).toBeGreaterThan(0);
        expect(bot.spectator).toBe(false);
      }
      expect(new Set(botsIn(room).map((bot) => bot.name)).size).toBe(2);

      tickDriver.step(1);
      expect(room.state.phase).toBe("Countdown");
      tickDriver.step(COUNTDOWN_TICKS);
      expect(room.state.phase).toBe("RoundActive");
    });

    it("clamps what a client asks for: at least one bot, at most three, an unknown tier means normal", async () => {
      const many = await practiceRoom({ botCount: 99, botTier: "nightmare" });
      connectAs(colyseus, "solo-2");
      await colyseus.connectTo(many.room);
      await flush();
      expect(botsIn(many.room)).toHaveLength(3);

      const none = await practiceRoom({ botCount: -4 });
      connectAs(colyseus, "solo-3");
      await colyseus.connectTo(none.room);
      await flush();
      expect(botsIn(none.room)).toHaveLength(1);
    });

    it("the bots move on their own: nobody sends them an input", async () => {
      const { tickDriver, room } = await practiceRoom({ botCount: 1, botTier: "hard" });
      connectAs(colyseus, "solo-4");
      await colyseus.connectTo(room);
      await flush();
      tickDriver.step(1 + COUNTDOWN_TICKS);
      const bot = botsIn(room)[0]!;
      const startX = bot.x;
      tickDriver.step(120);
      expect(Math.abs(bot.x - startX)).toBeGreaterThan(20);
      expect(bot.lastProcessedSeq).toBeGreaterThan(100);
    });

    it("plays to a result, persists nothing, and lets the room dispose when the human leaves", async () => {
      const { tickDriver, repo, room } = await practiceRoom({ botCount: 1, botTier: "hard" });
      connectAs(colyseus, "solo-5");
      const human = await colyseus.connectTo(room);
      let result: (MatchResult & { names?: Record<string, string> }) | undefined;
      human.onMessage(MESSAGE_TYPES.MATCH_RESULT, (payload) => {
        result = payload;
      });
      await flush();

      // The human never presses anything, so the bot wins: an easy way to finish a whole match.
      await stepUntil(tickDriver, () => room.state.phase === "MatchOver");
      await flush();

      expect(result).toBeDefined();
      expect(result!.winner).toBeTruthy();
      expect(result!.stats[result!.winner!]!.roundsWon).toBe(ROUNDS_TO_WIN);
      const botName = botsIn(room)[0]!.name;
      expect(Object.values(result!.names ?? {})).toContain(botName);
      // Bots have no user id: nothing could be recorded, and nothing was.
      expect(repo.recordedMatches.size).toBe(0);

      await human.leave();
      await flush();
      expect(colyseus.getRoomById(room.roomId)).toBeUndefined();
    }, 30_000);

    it("bots draft without holding the draft open for its whole timeout", async () => {
      const { tickDriver, room } = await practiceRoom({ botCount: 1, botTier: "hard" });
      connectAs(colyseus, "solo-6");
      const human = await colyseus.connectTo(room);
      let offer: { offers: string[] } | undefined;
      human.onMessage(MESSAGE_TYPES.DRAFT_OFFER, (payload) => {
        offer = payload;
      });
      await flush();

      await stepUntil(tickDriver, () => room.state.phase === "Draft");
      await flush();
      expect(offer).toBeDefined();
      const bot = botsIn(room)[0]!;
      // Wait for the bot's pick to be applied (a tick or two), not for 15 s.
      tickDriver.step(2);
      human.send(MESSAGE_TYPES.DRAFT_PICK, { id: offer!.offers[0] });
      await flush();
      tickDriver.step(5);
      expect(room.state.phase).toBe("Countdown");
      expect(bot.powerups.length).toBeGreaterThan(0);
    }, 30_000);

    it("a rematch (same room, same players) starts a fresh match at full health", async () => {
      const { tickDriver, room } = await practiceRoom({ botCount: 1, botTier: "hard" });
      connectAs(colyseus, "solo-7");
      const human = await colyseus.connectTo(room);
      await flush();
      await stepUntil(tickDriver, () => room.state.phase === "MatchOver");

      // Only a MatchOver room takes a rematch; and the request is the human's alone to make.
      human.send(MESSAGE_TYPES.REMATCH);
      await flush();
      tickDriver.step(2);
      expect(["Waiting", "Countdown"]).toContain(room.state.phase);

      expect(room.state.round).toBe(0);
      for (const player of room.state.players.values()) {
        expect(player.hp).toBe(MAX_HP);
        expect(player.roundsWon).toBe(0);
        expect(player.wantsRematch).toBe(false);
        expect(player.powerups.length).toBe(0);
      }
      expect(botsIn(room)).toHaveLength(1);

      tickDriver.step(COUNTDOWN_TICKS);
      expect(room.state.phase).toBe("RoundActive");
    }, 30_000);

    it("ignores a rematch request while a match is still being played", async () => {
      const { tickDriver, room } = await practiceRoom({ botCount: 1 });
      connectAs(colyseus, "solo-8");
      const human = await colyseus.connectTo(room);
      await flush();
      tickDriver.step(1 + COUNTDOWN_TICKS);
      human.send(MESSAGE_TYPES.REMATCH);
      await flush();
      tickDriver.step(1);
      expect(room.state.phase).toBe("RoundActive");
      expect(humansIn(room)[0]!.wantsRematch).toBe(false);
    });

    it("is never matched by quick play, and refuses a second human", async () => {
      const { room } = await practiceRoom({ botCount: 1 });
      connectAs(colyseus, "solo-9");
      await colyseus.connectTo(room);
      await flush();

      connectAs(colyseus, "intruder-9");
      await expect(colyseus.connectTo(room)).rejects.toBeDefined();
      connectAs(colyseus, "quick-9");
      const quick = await colyseus.sdk.joinOrCreate(MATCH_ROOM_NAME, { mode: "quick" });
      expect(quick.roomId).not.toBe(room.roomId);
      await quick.leave();
    });
  });

  describe("quick-play backfill (decision D4)", () => {
    async function quickRoom() {
      const tickDriver = new ManualTickDriver();
      const repo = new InMemoryPlayerRepository();
      const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
        tickDriver,
        playerRepository: repo,
        arenaId: "castleRoom",
        mode: "quick",
      });
      return { tickDriver, repo, room };
    }

    async function withOffer() {
      const setup = await quickRoom();
      connectAs(colyseus, `lone-${setup.room.roomId}`);
      const human = await colyseus.connectTo(setup.room);
      await flush();
      setup.tickDriver.step(BACKFILL_OFFER_TICKS);
      await flush();
      return { ...setup, human };
    }

    it("offers a bot only after the wait, and never adds one by itself", async () => {
      const { tickDriver, room } = await quickRoom();
      connectAs(colyseus, "lone-a");
      await colyseus.connectTo(room);
      await flush();

      tickDriver.step(BACKFILL_OFFER_TICKS - 5);
      expect(room.state.backfillOfferable).toBe(false);
      tickDriver.step(10);
      expect(room.state.backfillOfferable).toBe(true);
      // Left alone for a long time: still no bot. It was offered, not given.
      tickDriver.step(BACKFILL_OFFER_TICKS * 3);
      expect(botsIn(room)).toHaveLength(0);
      expect(room.state.phase).toBe("Waiting");
    });

    it("ignores a request that comes before the offer", async () => {
      const { tickDriver, room } = await quickRoom();
      connectAs(colyseus, "lone-b");
      const human = await colyseus.connectTo(room);
      await flush();
      tickDriver.step(10);

      human.send(MESSAGE_TYPES.BOT_BACKFILL, { tier: "normal" });
      await flush();
      tickDriver.step(2);
      expect(botsIn(room)).toHaveLength(0);
    });

    it("rejects a malformed request even when the offer stands", async () => {
      const { tickDriver, room, human } = await withOffer();
      human.send(MESSAGE_TYPES.BOT_BACKFILL, { tier: "nightmare" });
      human.send(MESSAGE_TYPES.BOT_BACKFILL, "hard");
      await flush();
      tickDriver.step(2);
      expect(botsIn(room)).toHaveLength(0);
    });

    it("seats a bot on request, starts the match, and stops offering", async () => {
      const { tickDriver, room, human } = await withOffer();
      human.send(MESSAGE_TYPES.BOT_BACKFILL, { tier: "hard" });
      await flush();
      tickDriver.step(1);

      expect(botsIn(room)).toHaveLength(1);
      expect(room.state.backfillOfferable).toBe(false);
      tickDriver.step(1);
      expect(room.state.phase).toBe("Countdown");
    });

    it("sends the bot away, with a message, when a human joins during the countdown", async () => {
      const { tickDriver, room, human } = await withOffer();
      const dropped: { name: string }[] = [];
      human.onMessage(MESSAGE_TYPES.BOT_DROPPED, (payload) => dropped.push(payload));
      human.send(MESSAGE_TYPES.BOT_BACKFILL, { tier: "normal" });
      await flush();
      tickDriver.step(30);
      expect(room.state.phase).toBe("Countdown");
      const botName = botsIn(room)[0]!.name;

      connectAs(colyseus, `arrival-${room.roomId}`);
      await colyseus.connectTo(room);
      await flush();

      expect(botsIn(room)).toHaveLength(0);
      expect(humansIn(room)).toHaveLength(2);
      expect(dropped).toEqual([{ name: botName }]);
      // Two humans keep the countdown going; it never fell back to Waiting.
      tickDriver.step(1);
      expect(room.state.phase).toBe("Countdown");
      tickDriver.step(COUNTDOWN_TICKS);
      expect(room.state.phase).toBe("RoundActive");
    });

    it("locks the room once the fight starts, so quick play does not route a stranger into it", async () => {
      const { tickDriver, room, human } = await withOffer();
      human.send(MESSAGE_TYPES.BOT_BACKFILL, { tier: "normal" });
      await flush();
      tickDriver.step(2 + COUNTDOWN_TICKS);
      await flush();
      expect(room.state.phase).toBe("RoundActive");

      connectAs(colyseus, "stranger");
      const stranger = await colyseus.sdk.joinOrCreate(MATCH_ROOM_NAME, { mode: "quick" });
      expect(stranger.roomId).not.toBe(room.roomId);
      await stranger.leave();
    });

    it("records nothing for a match a backfill bot played in", async () => {
      const { tickDriver, repo, room, human } = await withOffer();
      human.send(MESSAGE_TYPES.BOT_BACKFILL, { tier: "hard" });
      await flush();
      await stepUntil(tickDriver, () => room.state.phase === "MatchOver");
      await flush();
      expect(repo.recordedMatches.size).toBe(0);
    }, 30_000);

    it("still records a match between two humans, and a dropped backfill bot leaves no trace in it", async () => {
      const { tickDriver, repo, room, human } = await withOffer();
      human.send(MESSAGE_TYPES.BOT_BACKFILL, { tier: "easy" });
      await flush();
      tickDriver.step(30);
      connectAs(colyseus, `arrival2-${room.roomId}`);
      const second = await colyseus.connectTo(room);
      await flush();
      expect(botsIn(room)).toHaveLength(0);

      await playHumansToMatchOver(colyseus, tickDriver, room, second);
      await flush();
      expect(room.state.phase).toBe("MatchOver");
      expect(repo.recordedMatches.size).toBe(1);
      const [record] = [...repo.recordedMatches.values()];
      expect(record!.participants).toHaveLength(2);
    }, 30_000);
  });

  describe("two humans", () => {
    it("a rematch waits for both of them", async () => {
      const tickDriver = new ManualTickDriver();
      const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
        tickDriver,
        arenaId: "castleRoom",
        mode: "quick",
      });
      connectAs(colyseus, "duo-a");
      const a: ClientRoom = await colyseus.connectTo(room);
      connectAs(colyseus, "duo-b");
      const dropped: ClientRoom = await colyseus.connectTo(room);
      await flush();
      // `dropped` loses every round by disconnecting, and comes back for the results screen.
      const b = await playHumansToMatchOver(colyseus, tickDriver, room, dropped);
      expect(room.state.phase).toBe("MatchOver");

      a.send(MESSAGE_TYPES.REMATCH);
      await flush();
      tickDriver.step(2);
      expect(room.state.phase).toBe("MatchOver");
      expect(room.state.players.get(a.sessionId)!.wantsRematch).toBe(true);

      b.send(MESSAGE_TYPES.REMATCH);
      await flush();
      tickDriver.step(2);
      expect(room.state.phase).not.toBe("MatchOver");
      expect(room.state.round).toBe(0);
    }, 60_000);
  });
});
