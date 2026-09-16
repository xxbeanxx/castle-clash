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

    const b = await colyseus.connectTo(room);
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

    // RoundOver -> Draft -> Countdown -> RoundActive, round 2, full HP.
    tickDriver.step(ROUND_OVER_TICKS + 1 + COUNTDOWN_TICKS);
    await room.waitForNextPatch();

    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.round).toBe(2);
    expect(room.state.players.get(a.sessionId)!.hp).toBe(MAX_HP);
    expect(room.state.players.get(b.sessionId)!.hp).toBe(MAX_HP);
    expect(room.state.players.get(b.sessionId)!.alive).toBe(true);

    await a.leave();
    await b.leave();
  }, 20000);
});
