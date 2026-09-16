import {
  COUNTDOWN_TICKS,
  DRAFT_TICKS,
  encode,
  MATCH_ROOM_NAME,
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

/** Same choreography as `MatchRoom.flow.test.ts`'s helper of the same name —
 *  duplicated rather than shared/exported across test files, matching this
 *  repo's existing precedent of each `MatchRoom.*.test.ts` being a
 *  self-contained black-box script. */
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

interface DraftOfferPayload {
  offers: string[];
  endsAtTick: number;
}

/** Connects two active players (`a`, `b`) and a third, spectating connection
 *  (`c`, joined mid-`RoundActive` — plan step 3's "late joiners ... spectate"
 *  — so it must never receive a draft offer for round 1's draft), fights a
 *  and b to a real KO, and drives the room to `RoundOver`. */
async function setupThroughRoundOver(colyseus: ColyseusTestServer): Promise<{
  tickDriver: ManualTickDriver;
  room: MatchRoom;
  a: ClientRoom;
  b: ClientRoom;
  c: ClientRoom;
  offersA: DraftOfferPayload[];
  offersB: DraftOfferPayload[];
  offersC: DraftOfferPayload[];
}> {
  const tickDriver = new ManualTickDriver();
  const room = await colyseus.createRoom(MATCH_ROOM_NAME, { tickDriver, arenaId: "castleRoom" });

  const offersA: DraftOfferPayload[] = [];
  const offersB: DraftOfferPayload[] = [];
  const offersC: DraftOfferPayload[] = [];

  const a = await colyseus.connectTo(room);
  a.onMessage(MESSAGE_TYPES.DRAFT_OFFER, (payload: DraftOfferPayload) => offersA.push(payload));
  const b = await colyseus.connectTo(room);
  b.onMessage(MESSAGE_TYPES.DRAFT_OFFER, (payload: DraftOfferPayload) => offersB.push(payload));

  tickDriver.step(1);
  await room.waitForNextPatch();
  tickDriver.step(COUNTDOWN_TICKS);
  await room.waitForNextPatch();
  expect(room.state.phase).toBe("RoundActive");

  const c = await colyseus.connectTo(room);
  c.onMessage(MESSAGE_TYPES.DRAFT_OFFER, (payload: DraftOfferPayload) => offersC.push(payload));
  expect(room.state.players.get(c.sessionId)!.spectator).toBe(true);

  await attackUntilEliminated(tickDriver, room, a, b);
  await room.waitForNextPatch();
  expect(room.state.phase).toBe("RoundOver");

  return { tickDriver, room, a, b, c, offersA, offersB, offersC };
}

describe("MatchRoom draft", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("sends each active player only its own private draft offer, never the spectator", async () => {
    const { tickDriver, room, a, b, c, offersA, offersB, offersC } = await setupThroughRoundOver(colyseus);

    tickDriver.step(ROUND_OVER_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Draft");
    await flush();

    expect(offersA).toHaveLength(1);
    expect(offersB).toHaveLength(1);
    expect(offersA[0]!.offers).toHaveLength(3);
    expect(new Set(offersA[0]!.offers).size).toBe(3);
    expect(offersB[0]!.offers).toHaveLength(3);
    // The spectator (never an active player this round) gets nothing.
    expect(offersC).toHaveLength(0);

    await a.leave();
    await b.leave();
    await c.leave();
  }, 20000);

  it("syncs powerups and starts the next round once every active player has picked", async () => {
    const { tickDriver, room, a, b, c, offersA, offersB } = await setupThroughRoundOver(colyseus);

    tickDriver.step(ROUND_OVER_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Draft");
    await flush();

    const pickedA = offersA[0]!.offers[0]!;
    const pickedB = offersB[0]!.offers[0]!;
    a.send(MESSAGE_TYPES.DRAFT_PICK, { id: pickedA });
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Draft"); // b hasn't picked yet

    b.send(MESSAGE_TYPES.DRAFT_PICK, { id: pickedB });
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Countdown");
    expect(room.state.players.get(a.sessionId)!.powerups.toArray()).toEqual([pickedA]);
    expect(room.state.players.get(b.sessionId)!.powerups.toArray()).toEqual([pickedB]);

    tickDriver.step(COUNTDOWN_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("RoundActive");
    expect(room.state.round).toBe(2);

    await a.leave();
    await b.leave();
    await c.leave();
  }, 20000);

  it("rejects a pick outside the offered set and a repeat pick", async () => {
    const { tickDriver, room, a, b, c, offersA } = await setupThroughRoundOver(colyseus);

    tickDriver.step(ROUND_OVER_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Draft");
    await flush();

    a.send(MESSAGE_TYPES.DRAFT_PICK, { id: "not-a-real-power-up" });
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.players.get(a.sessionId)!.powerups.toArray()).toEqual([]);

    const first = offersA[0]!.offers[0]!;
    const second = offersA[0]!.offers[1]!;
    a.send(MESSAGE_TYPES.DRAFT_PICK, { id: first });
    a.send(MESSAGE_TYPES.DRAFT_PICK, { id: second }); // repeat pick — rejected
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.players.get(a.sessionId)!.powerups.toArray()).toEqual([first]);

    await a.leave();
    await b.leave();
    await c.leave();
  }, 20000);

  it("auto-picks deterministically once the draft timeout elapses", async () => {
    const { tickDriver, room, a, b, c } = await setupThroughRoundOver(colyseus);

    tickDriver.step(ROUND_OVER_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Draft");

    // Neither client ever sends a pick — both `match/phase.ts`'s own hard
    // `DRAFT_TICKS` fallback and `DraftService`'s seeded auto-pick resolve
    // it instead, on the same tick (see `MatchRoom.#tick`'s doc comment on
    // why `DraftService.tick` is fed `stepResult.state.tick`).
    tickDriver.step(DRAFT_TICKS);
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("Countdown");

    // `#applyDraftPicks()` folds a resolved pick into schema one tick after
    // it resolves (it runs at the top of `#tick`, before that same tick's
    // own auto-pick check) — one more tick to observe it.
    tickDriver.step(1);
    await room.waitForNextPatch();
    expect(room.state.players.get(a.sessionId)!.powerups.toArray()).toHaveLength(1);
    expect(room.state.players.get(b.sessionId)!.powerups.toArray()).toHaveLength(1);

    await a.leave();
    await b.leave();
    await c.leave();
  }, 20000);
});
