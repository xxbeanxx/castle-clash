import {
  encode,
  MATCH_ROOM_NAME,
  MAX_HP,
  MESSAGE_TYPES,
  TUTORIAL_ARENA,
  type SimEvent,
} from "@castle-clash/shared";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryPlayerRepository } from "../src/persistence/InMemoryPlayerRepository.js";
import { server } from "../src/index.js";
import type { MatchRoom } from "../src/rooms/MatchRoom.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

const RIGHT = encode(["RIGHT"]);
const LIGHT = encode(["LIGHT"]);

describe("MatchRoom tutorial", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  async function tutorialRoom() {
    const tickDriver = new ManualTickDriver();
    const repo = new InMemoryPlayerRepository();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
      tickDriver,
      playerRepository: repo,
      mode: "tutorial",
      // A client cannot pick the tutorial's arena: this must be ignored.
      arenaId: "pit",
    });
    connectAs(colyseus, `tut-${room.roomId}`);
    const human = await colyseus.connectTo(room);
    await flush();
    return { tickDriver, repo, room, human };
  }

  const dummyIn = (room: MatchRoom) => [...room.state.players.values()].find((p) => p.isBot)!;
  const humanIn = (room: MatchRoom) => [...room.state.players.values()].find((p) => !p.isBot)!;

  it("seats the player and a dummy in the tutorial arena, and is already a live fight: no countdown, no rounds", async () => {
    const { tickDriver, room } = await tutorialRoom();
    tickDriver.step(5);

    expect(room.state.mode).toBe("tutorial");
    expect(room.state.arenaId).toBe(TUTORIAL_ARENA.id);
    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.round).toBe(1);
    expect(room.state.players.size).toBe(2);
    expect(dummyIn(room).name).toBe("Training dummy");
    expect(humanIn(room).alive).toBe(true);
  });

  it("the dummy never acts, however long the player stands next to it", async () => {
    const { tickDriver, room } = await tutorialRoom();
    const dummy = dummyIn(room);
    tickDriver.step(600);
    expect(dummy.action).toBe("Idle");
    expect(dummy.hp).toBe(MAX_HP);
    expect(humanIn(room).hp).toBe(MAX_HP);
  });

  it("stays in its one live round for as long as anyone likes (no match ever ends)", async () => {
    const { tickDriver, room } = await tutorialRoom();
    tickDriver.step(60 * 60 * 3);
    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.round).toBe(1);
  });

  it("the player's own input moves them", async () => {
    const { tickDriver, room, human } = await tutorialRoom();
    tickDriver.step(5);
    const startX = humanIn(room).x;
    for (let seq = 1; seq <= 30; seq++) {
      human.send(MESSAGE_TYPES.INPUT, { seq, bits: RIGHT });
      await flush();
      tickDriver.step(1);
    }
    expect(humanIn(room).x).toBeGreaterThan(startX + 20);
  });

  it("a knocked-out dummy stands back up, at full health, where it began", async () => {
    const { tickDriver, room, human } = await tutorialRoom();
    tickDriver.step(5);
    const dummy = dummyIn(room);
    const home = { x: dummy.x, y: dummy.y };
    const events: SimEvent[] = [];
    human.onMessage(MESSAGE_TYPES.FX, (payload: SimEvent[]) => events.push(...payload));

    await walkAndSwingUntil(tickDriver, room, human, () => dummy.action === "Dead", 4000);
    expect(dummy.alive).toBe(false);
    // Down, not gone: it is still in the room and comes back.
    tickDriver.step(200);
    expect(dummy.action).not.toBe("Dead");
    expect(dummy.hp).toBe(MAX_HP);
    expect(Math.abs(dummy.x - home.x)).toBeLessThan(5);
    expect(dummy.alive).toBe(true);
    expect(room.state.phase).toBe("RoundActive");
  }, 30_000);

  it("records nothing, and disposes with its one human", async () => {
    const { tickDriver, repo, room, human } = await tutorialRoom();
    tickDriver.step(120);
    expect(repo.recordedMatches.size).toBe(0);

    await human.leave();
    await flush();
    expect(colyseus.getRoomById(room.roomId)).toBeUndefined();
  });

  it("holds one client only, and quick play never lands in it", async () => {
    const { room } = await tutorialRoom();
    connectAs(colyseus, "intruder");
    await expect(colyseus.connectTo(room)).rejects.toBeDefined();
    connectAs(colyseus, "quick-tut");
    const quick = await colyseus.sdk.joinOrCreate(MATCH_ROOM_NAME, { mode: "quick" });
    expect(quick.roomId).not.toBe(room.roomId);
    await quick.leave();
  });
});

/**
 * Runs at the dummy and swings until `done()`. One frame per six ticks, not one per tick: the room
 * rate-limits a connection to 120 messages a second of real time, which a test stepping ticks as
 * fast as it can would blow through, and `InputQueue` repeats the last frame for six ticks anyway.
 */
async function walkAndSwingUntil(
  tickDriver: ManualTickDriver,
  room: MatchRoom,
  human: ClientRoom,
  done: () => boolean,
  maxTicks: number,
): Promise<void> {
  let seq = 0;
  for (let ticks = 0; ticks < maxTicks && !done(); ticks += 6) {
    const me = [...room.state.players.values()].find((p) => !p.isBot)!;
    const dummy = [...room.state.players.values()].find((p) => p.isBot)!;
    seq += 1;
    const bits = Math.abs(dummy.x - me.x) > 90 ? RIGHT : LIGHT;
    human.send(MESSAGE_TYPES.INPUT, { seq, bits });
    await new Promise((resolve) => setTimeout(resolve, 12));
    tickDriver.step(6);
  }
  if (!done()) {
    throw new Error("the dummy was not knocked out");
  }
}
