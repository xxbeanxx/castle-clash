import { COSMETIC_CATALOG, WEAPON_IDS } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { InMemoryPlayerRepository } from "../persistence/InMemoryPlayerRepository.js";
import type { MatchResultRecord } from "../persistence/PlayerRepository.js";
import { evaluateAndGrantUnlocks } from "./unlocks.js";

function makeResult(overrides: Partial<MatchResultRecord> = {}): MatchResultRecord {
  return {
    matchId: crypto.randomUUID(),
    arenaIds: ["pit"],
    mode: "quick",
    startedAt: new Date("2026-01-01T00:00:00Z"),
    endedAt: new Date("2026-01-01T00:05:00Z"),
    winnerId: "winner",
    serverVersion: "test",
    participants: [
      {
        playerId: "winner",
        placement: 1,
        roundsWon: 2,
        eliminations: 0,
        deaths: 0,
        damageDealt: 0,
        powerups: [],
        weapon: WEAPON_IDS.SWORD,
      },
    ],
    ...overrides,
  };
}

describe("evaluateAndGrantUnlocks", () => {
  it("grants a new unlock and notifies once a match result crosses a threshold", async () => {
    const repo = new InMemoryPlayerRepository();
    // One win away from `matchesPlayed >= 3` ("cape-tattered"), already at
    // the win count "helmet-bronze"/others don't need — isolates this test
    // to exactly one item crossing its threshold.
    repo.seedStats("winner", { wins: 0, eliminations: 0, matchesPlayed: 2, winsByWeapon: {} });
    await repo.recordMatch(makeResult());

    const notified: Array<{ userId: string; items: readonly string[] }> = [];
    await evaluateAndGrantUnlocks(repo, ["winner"], (userId, items) => {
      notified.push({ userId, items });
    });

    await expect(repo.getUnlocks("winner")).resolves.toContain("cape-tattered");
    expect(notified).toEqual([{ userId: "winner", items: ["cape-tattered"] }]);
  });

  it("does not notify or grant anything when no threshold is crossed", async () => {
    const repo = new InMemoryPlayerRepository();
    const notify = () => {
      throw new Error("should not be called");
    };

    await evaluateAndGrantUnlocks(repo, ["nobody"], notify);

    await expect(repo.getUnlocks("nobody")).resolves.toEqual([]);
  });

  it("never re-grants or re-notifies once every unlockable item is already owned", async () => {
    const repo = new InMemoryPlayerRepository();
    const allUnlockable = COSMETIC_CATALOG.filter((item) => item.unlock.type !== "default").map(
      (item) => item.id,
    );
    repo.seedStats("winner", {
      wins: 999,
      eliminations: 999,
      matchesPlayed: 999,
      winsByWeapon: { [WEAPON_IDS.SWORD]: 999, [WEAPON_IDS.MACE]: 999, [WEAPON_IDS.SPEAR]: 999 },
    });
    repo.seedUnlocks("winner", allUnlockable);

    let notifyCount = 0;
    await evaluateAndGrantUnlocks(repo, ["winner"], () => {
      notifyCount += 1;
    });

    expect(notifyCount).toBe(0);
    await expect(repo.getUnlocks("winner")).resolves.toHaveLength(allUnlockable.length);
  });
});
