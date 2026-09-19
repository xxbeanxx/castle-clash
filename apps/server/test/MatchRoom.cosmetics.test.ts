import {
  COUNTDOWN_TICKS,
  DRAFT_TICKS,
  MATCH_ROOM_NAME,
  MESSAGE_TYPES,
  ROUND_OVER_TICKS,
  ROUNDS_TO_WIN,
} from "@castle-clash/shared";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryPlayerRepository } from "../src/persistence/InMemoryPlayerRepository.js";
import { MatchRoom } from "../src/rooms/MatchRoom.js";
import { ManualTickDriver } from "../src/rooms/TickDriver.js";
import { server } from "../src/index.js";
import { connectAs, stubAuthForTests } from "./testAuth.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/** Same technique `MatchRoom.auth.test.ts` uses to end a round without a
 *  real fight — dropping a connection counts as an elimination. */
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

describe("MatchRoom cosmetics", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    stubAuthForTests();
    colyseus = await boot(server);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it("propagates a valid, owned cosmetic loadout to every connected client", async () => {
    const repo = new InMemoryPlayerRepository();
    repo.seedUnlocks("cosmetics-owner", ["helmet-gold", "cape-royal"]);
    repo.seedLoadout("cosmetics-owner", {
      weapon: "mace",
      tintPrimary: 0xff0000,
      tintSecondary: 0x00ff00,
      helmetId: "helmet-gold",
      capeId: "cape-royal",
      weaponStyleId: null,
    });

    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { playerRepository: repo });
    connectAs(colyseus, "cosmetics-owner");
    const owner = await colyseus.connectTo(room);
    connectAs(colyseus, "cosmetics-observer");
    const observer = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    for (const client of [owner, observer]) {
      const cosmetics = client.state.players.get(owner.sessionId)!.cosmetics;
      expect(cosmetics.helmetId).toBe("helmet-gold");
      expect(cosmetics.capeId).toBe("cape-royal");
      expect(cosmetics.weaponStyleId).toBe("weaponStyle-none");
      expect(cosmetics.tintPrimary).toBe(0xff0000);
      expect(cosmetics.tintSecondary).toBe(0x00ff00);
    }

    await owner.leave();
    await observer.leave();
  });

  it("falls back to the default item when a loadout references an unowned cosmetic", async () => {
    const repo = new InMemoryPlayerRepository();
    // Deliberately NOT seeding player_unlocks for "helmet-gold" — this
    // mirrors a stale/spoofed `player_loadouts` row (plan Phase 9 step 3:
    // "Client-supplied cosmetics are never trusted").
    repo.seedLoadout("cosmetics-cheater", {
      weapon: "sword",
      tintPrimary: 0,
      tintSecondary: 0,
      helmetId: "helmet-gold",
      capeId: null,
      weaponStyleId: null,
    });

    const room = await colyseus.createRoom(MATCH_ROOM_NAME, { playerRepository: repo });
    connectAs(colyseus, "cosmetics-cheater");
    const cheater = await colyseus.connectTo(room);
    connectAs(colyseus, "cosmetics-cheater-observer");
    const observer = await colyseus.connectTo(room);
    await room.waitForNextPatch();

    for (const client of [cheater, observer]) {
      expect(client.state.players.get(cheater.sessionId)!.cosmetics.helmetId).toBe("helmet-none");
    }

    await cheater.leave();
    await observer.leave();
  });

  it("grants a new unlock and sends profile:unlocks once a completed match crosses its threshold", async () => {
    const repo = new InMemoryPlayerRepository();
    // One match away from the "matchesPlayed >= 3" threshold
    // ("cape-tattered") — isolates this test to exactly one unlock.
    repo.seedStats("unlock-winner", {
      wins: 0,
      eliminations: 0,
      matchesPlayed: 2,
      winsByWeapon: {},
    });
    const tickDriver = new ManualTickDriver();
    const room = await colyseus.createRoom(MATCH_ROOM_NAME, {
      tickDriver,
      arenaId: "castleRoom",
      playerRepository: repo,
    });

    connectAs(colyseus, "unlock-winner");
    const winner = await colyseus.connectTo(room);
    connectAs(colyseus, "unlock-loser");
    let loser = await colyseus.connectTo(room);
    tickDriver.step(1 + COUNTDOWN_TICKS);
    await room.waitForNextPatch();

    const unlockMessage = new Promise<string[]>((resolve) => {
      winner.onMessage(MESSAGE_TYPES.PROFILE_UNLOCKS, (items: string[]) => resolve(items));
    });

    for (let round = 1; round < ROUNDS_TO_WIN; round++) {
      loser = await endRoundByDropping(colyseus, tickDriver, room, loser);
      tickDriver.step(ROUND_OVER_TICKS);
      await room.waitForNextPatch();
      tickDriver.step(DRAFT_TICKS);
      await room.waitForNextPatch();
      tickDriver.step(COUNTDOWN_TICKS);
      await room.waitForNextPatch();
    }

    // Final round: drop the loser one more time to reach MatchOver.
    await loser.leave(false);
    await flush();
    tickDriver.step(1);
    await room.waitForNextPatch();
    await flush();

    expect(room.state.phase).toBe("MatchOver");
    const newlyUnlocked = await unlockMessage;
    expect(newlyUnlocked).toContain("cape-tattered");
    await expect(repo.getUnlocks("unlock-winner")).resolves.toContain("cape-tattered");

    await winner.leave();
  }, 10000);
});
