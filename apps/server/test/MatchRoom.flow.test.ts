import {
  COUNTDOWN_TICKS,
  encode,
  MATCH_ROOM_NAME,
  MAX_HP,
  MESSAGE_TYPES,
  ROUND_OVER_TICKS,
} from "@castle-clash/shared";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../src/index.js";
import type { MatchRoom } from "../src/rooms/MatchRoom.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const RIGHT = encode(["RIGHT"]);
const LEFT = encode(["LEFT"]);
const LIGHT = encode(["LIGHT"]);
const REACH_THRESHOLD = 90;

/** Repeatedly re-approaches and attacks until `defender` is eliminated —
 *  tolerates knockback drift by re-closing the distance between swings,
 *  rather than assuming a fixed number of hits lands cleanly. */
async function attackUntilEliminated(
  tickDriver: ManualTickDriver,
  room: MatchRoom,
  attacker: ClientRoom,
  defender: ClientRoom,
  maxTicks = 3000,
): Promise<void> {
  let seq = 0;
  for (let i = 0; i < maxTicks; i++) {
    const a = room.state.players.get(attacker.sessionId)!;
    const b = room.state.players.get(defender.sessionId)!;
    if (!b.alive) {
      return;
    }
    seq++;
    const dist = Math.abs(a.x - b.x);
    const attackerBits = dist > REACH_THRESHOLD ? (a.x < b.x ? RIGHT : LEFT) : LIGHT;
    attacker.send(MESSAGE_TYPES.INPUT, { seq, bits: attackerBits });
    defender.send(MESSAGE_TYPES.INPUT, { seq, bits: 0 });
    await flush();
    tickDriver.step(1);
  }
  throw new Error("defender was not eliminated within maxTicks");
}

describe("MatchRoom flow", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("goes Waiting -> Countdown -> RoundActive, then RoundOver on a KO, then a fresh round at full HP", async () => {
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver, arenaId: "castleRoom" });

    const a = await colyseus.connectTo(room);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Waiting");

    let offerA: { offers: string[]; endsAtTick: number } | undefined;
    let offerB: { offers: string[]; endsAtTick: number } | undefined;
    a.onMessage(MESSAGE_TYPES.DRAFT_OFFER, (payload: { offers: string[]; endsAtTick: number }) => {
      offerA = payload;
    });

    const b = await colyseus.connectTo(room);
    b.onMessage(MESSAGE_TYPES.DRAFT_OFFER, (payload: { offers: string[]; endsAtTick: number }) => {
      offerB = payload;
    });
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Countdown");

    tickDriver.step(COUNTDOWN_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.round).toBe(1);

    await attackUntilEliminated(tickDriver, room, a, b);
    await room.waitForNextPatch();

    expect(room.state.phase).toBe("RoundOver");
    expect(room.state.players.get(a.sessionId)!.roundsWon).toBe(1);
    expect(room.state.players.get(b.sessionId)!.alive).toBe(false);

    // RoundOver -> Draft: both clients get a private offer, pick from it.
    tickDriver.step(ROUND_OVER_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Draft");
    await flush();
    expect(offerA).toBeDefined();
    expect(offerB).toBeDefined();

    a.send(MESSAGE_TYPES.DRAFT_PICK, { id: offerA!.offers[0] });
    b.send(MESSAGE_TYPES.DRAFT_PICK, { id: offerB!.offers[0] });
    await flush();

    // Draft -> Countdown -> RoundActive, round 2, full HP, powerups synced.
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Countdown");

    tickDriver.step(COUNTDOWN_TICKS);
    await room.waitForNextPatch();

    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.round).toBe(2);
    // Full health at the new round's respawn — >= rather than === MAX_HP,
    // since whichever power-up each client happened to draw and pick could
    // itself be a maxHp boost (a real Phase 7 effect, not test flakiness).
    expect(room.state.players.get(a.sessionId)!.hp).toBeGreaterThanOrEqual(MAX_HP);
    expect(room.state.players.get(b.sessionId)!.hp).toBeGreaterThanOrEqual(MAX_HP);
    expect(room.state.players.get(b.sessionId)!.alive).toBe(true);
    expect(room.state.players.get(a.sessionId)!.powerups.length).toBe(1);
    expect(room.state.players.get(a.sessionId)!.powerups[0]).toBe(offerA!.offers[0]);
    expect(room.state.players.get(b.sessionId)!.powerups.length).toBe(1);

    await a.leave();
    await b.leave();
  }, 20000);
});
