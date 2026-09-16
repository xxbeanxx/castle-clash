import { COUNTDOWN_TICKS, encode, MATCH_ROOM_NAME, MESSAGE_TYPES } from "@castle-clash/shared";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** `MatchRoom`'s per-connection rate limit (`MAX_MESSAGES_PER_SECOND` =
 *  `TICK_RATE * 2`, over a real wall-clock `RATE_LIMIT_WINDOW_MS` = 1000ms
 *  window) is keyed to real time, not tick count — a `ManualTickDriver`
 *  loop that sends one input per tick as fast as the event loop allows
 *  blows through it long before 1 real second passes for tests needing
 *  more than ~100 ticks (this one walks ~150+ then jump-attacks). Sending
 *  through this helper, instead of `client.send` directly, keeps every
 *  batch under the limit by waiting out the window every `BATCH_SIZE`
 *  sends — the same tradeoff every other `MatchRoom.*.test.ts`'s
 *  `flush()` makes, just amortized instead of per-message. */
const BATCH_SIZE = 90;
let sentThisWindow = 0;

async function sendInput(client: ClientRoom, seq: number, bits: number): Promise<void> {
  if (sentThisWindow >= BATCH_SIZE) {
    await new Promise((resolve) => setTimeout(resolve, 1050));
    sentThisWindow = 0;
  }
  client.send(MESSAGE_TYPES.INPUT, { seq, bits });
  sentThisWindow++;
  await flush();
}

const RIGHT = encode(["RIGHT"]);
const JUMP = encode(["JUMP"]);
const HEAVY = encode(["HEAVY"]);

const HAZARD_ID = "balconyBreakA";
// `balconyBreakA` (woodenHall.ts) sits at y:560-576, a full solid — a
// horizontal swing's body-height hitbox can never reach it from directly
// underneath (the body itself bonks the solid's underside and stops
// exactly at the touching boundary, never overlapping). The arena's
// `approachLedge` platform at x:670-750,y:590 is the intended way in: a
// step below the balcony, close enough that a heavy swing's reach connects
// with the overhead slab from beside/below it.
const LEDGE_X = 700;

type RoomLike = {
  state: {
    players: Map<string, { x: number; grounded: boolean }>;
    hazards: Map<string, { active: boolean }>;
  };
};

/** Walks `client` right, on the ground, until it's under the balcony's
 *  approach ledge, brakes to a stop (so the jump lands straight back down
 *  on the narrow ledge instead of sailing past it on leftover run speed),
 *  then jumps — holding JUMP for `RISE_TICKS` so `movement.ts`'s
 *  `applyVariableJumpHeight` doesn't cut it to a short hop that falls short
 *  of the ledge's height — and waits to land. `MatchRoom` never exposes an
 *  arbitrary spawn override, so getting into position is scripted input,
 *  the same as every other black-box `MatchRoom.*.test.ts`. */
const BRAKE_TICKS = 15;
const RISE_TICKS = 20;

async function reachApproachLedge(tickDriver: ManualTickDriver, client: ClientRoom, room: RoomLike, maxTicks = 400): Promise<void> {
  let seq = 0;

  async function send(bits: number): Promise<void> {
    seq++;
    await sendInput(client, seq, bits);
    tickDriver.step(1);
  }

  let ticks = 0;
  while (room.state.players.get(client.sessionId)!.x < LEDGE_X) {
    if (++ticks > maxTicks) {
      throw new Error("never reached the approach ledge (walk phase)");
    }
    await send(RIGHT);
  }

  for (let i = 0; i < BRAKE_TICKS; i++) {
    await send(0);
  }

  for (let i = 0; i < maxTicks; i++) {
    if (i > 0 && room.state.players.get(client.sessionId)!.grounded) {
      return;
    }
    await send(i < RISE_TICKS ? JUMP : 0);
  }
  throw new Error("never landed on the approach ledge (jump phase)");
}

async function breakFloorWithHeavySwings(
  tickDriver: ManualTickDriver,
  client: ClientRoom,
  room: RoomLike,
  hazardId: string,
  maxTicks = 200,
): Promise<void> {
  let seq = 0;
  for (let i = 0; i < maxTicks; i++) {
    if (!room.state.hazards.get(hazardId)!.active) {
      return;
    }
    seq++;
    await sendInput(client, seq, HEAVY);
    tickDriver.step(1);
  }
  throw new Error(`hazard "${hazardId}" never broke within maxTicks`);
}

describe("MatchRoom hazards", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  // Round-2 hazard reset is covered separately, at the `MatchDirector`
  // level (`apps/server/src/match/MatchDirector.test.ts`): ending a round
  // here needs a real KO or a disconnect, and a disconnect drops
  // `connectedIds` below `MIN_PLAYERS`, which blocks the *next* round's
  // Countdown from starting at all — orchestrating a real fight through
  // this same physics-timing-dependent black-box harness just to reach
  // round 2 would make this test slow and fragile for no extra coverage
  // `MatchDirector`'s own (much cheaper, deterministic) test doesn't
  // already give the reset wiring.
  it("breaking a floor in round 1 syncs hp=0/active=false to clients", async () => {
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver, arenaId: "woodenHall" });

    expect(room.state.arenaId).toBe("woodenHall");
    expect(room.state.hazards.get(HAZARD_ID)!.active).toBe(true);
    expect(room.state.hazards.get(HAZARD_ID)!.hp).toBe(16);

    connectAs(colyseus, "player-a");
    const a = await colyseus.connectTo(room);
    connectAs(colyseus, "player-b");
    await colyseus.connectTo(room);
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Countdown");

    tickDriver.step(COUNTDOWN_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.round).toBe(1);

    await reachApproachLedge(tickDriver, a, room);
    await breakFloorWithHeavySwings(tickDriver, a, room, HAZARD_ID);
    await room.waitForNextPatch();

    expect(room.state.hazards.get(HAZARD_ID)!.active).toBe(false);
    expect(room.state.hazards.get(HAZARD_ID)!.hp).toBe(0);
    expect(room.state.hazards.get(HAZARD_ID)!.phase).toBe("broken");
  }, 20000);
});
