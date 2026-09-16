import { encode, MATCH_ROOM_NAME, MESSAGE_TYPES, type CombatEvent } from "@castle-clash/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { server } from "../src/index.js";

/** `client.send` hands off to a real transport, which delivers to the room's
 *  `onMessage` handler asynchronously even in-process — flush a macrotask so
 *  the send (or a server broadcast) lands before/after a synchronous
 *  ManualTickDriver step. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const RIGHT = encode(["RIGHT"]);
const LEFT = encode(["LEFT"]);
const LIGHT = encode(["LIGHT"]);
const REACH_THRESHOLD = 90; // inside the default Sword's 98px (28 width + 70 reach) connect range
const MAX_APPROACH_TICKS = 200;

describe("MatchRoom combat", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("broadcasts an fx hit event and drops the defender's hp when an attack connects", async () => {
    const tickDriver = new ManualTickDriver();
    // Pinned to `castleRoom` (both of its first two spawns sit on the same
    // flat main floor) rather than left to `MatchRoom`'s default random
    // pick (Phase 6) — the approach-and-attack loop below assumes both
    // spawns are on the same flat, walkable ground within
    // `MAX_APPROACH_TICKS`, which doesn't hold for every arena (e.g.
    // `pit`'s spawns sit across a chasm, `colosseum`'s and `woodenHall`'s
    // first two spawns are at different heights).
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver, arenaId: "castleRoom" });
    const attacker = await colyseus.connectTo(room);
    const defender = await colyseus.connectTo(room);

    const fxEvents: CombatEvent[] = [];
    defender.onMessage(MESSAGE_TYPES.FX, (events: CombatEvent[]) => {
      fxEvents.push(...events);
    });

    function distance(): number {
      const a = room.state.players.get(attacker.sessionId)!;
      const b = room.state.players.get(defender.sessionId)!;
      return Math.abs(a.x - b.x);
    }

    let seq = 0;
    for (let i = 0; i < MAX_APPROACH_TICKS && distance() > REACH_THRESHOLD; i++) {
      seq++;
      attacker.send(MESSAGE_TYPES.INPUT, { seq, bits: RIGHT });
      defender.send(MESSAGE_TYPES.INPUT, { seq, bits: LEFT });
      await flush();
      tickDriver.step(1);
    }
    expect(distance()).toBeLessThanOrEqual(REACH_THRESHOLD);

    const hpBefore = room.state.players.get(defender.sessionId)!.hp;

    // Hold LIGHT through the Sword's startup (6 ticks) into its active
    // window, with a couple of ticks of margin.
    for (let i = 0; i < 8; i++) {
      seq++;
      attacker.send(MESSAGE_TYPES.INPUT, { seq, bits: LIGHT });
      defender.send(MESSAGE_TYPES.INPUT, { seq, bits: 0 });
      await flush();
      tickDriver.step(1);
    }
    await flush();

    const hpAfter = room.state.players.get(defender.sessionId)!.hp;
    expect(hpAfter).toBeLessThan(hpBefore);
    expect(fxEvents).toContainEqual(
      expect.objectContaining({ type: "hit", attacker: attacker.sessionId, defender: defender.sessionId }),
    );

    await attacker.leave();
    await defender.leave();
  });
});
