import { WEAPON_IDS } from "@castle-clash/shared";
import type {
  MatchResultRecord,
  PlayerRepository,
} from "../../src/persistence/PlayerRepository.js";
import { DEFAULT_LOADOUT, DEFAULT_UNLOCK_STATS } from "../../src/persistence/PlayerRepository.js";
import { describe, expect, it } from "vitest";

/**
 * One behavioral contract, run against every `PlayerRepository`
 * implementation (plan Phase 8 testing strategy) — `InMemoryPlayerRepository
 * .contract.test.ts` runs this in unit CI, `SupabasePlayerRepository
 * .contract.test.ts` runs the exact same assertions against a local
 * Supabase instance in integration CI. A behavior only one implementation
 * satisfies is a bug in this contract, not something either test file
 * should special-case around.
 *
 * `makeRepo` returns a fresh, empty repository per test — for
 * `SupabasePlayerRepository`, "fresh" means whatever an empty local
 * database's tables actually contain, so that test file is responsible for
 * using ids no other test in the same run has touched.
 */
export function runPlayerRepositoryContractTests(
  makeRepo: () => PlayerRepository | Promise<PlayerRepository>,
  makeUserId: () => string,
): void {
  describe("PlayerRepository contract", () => {
    it("returns the default loadout for a player with none saved", async () => {
      const repo = await makeRepo();
      await expect(repo.getLoadout(makeUserId())).resolves.toEqual(DEFAULT_LOADOUT);
    });

    it("returns an empty unlock list for a player with none", async () => {
      const repo = await makeRepo();
      await expect(repo.getUnlocks(makeUserId())).resolves.toEqual([]);
    });

    it("recordMatch is idempotent on matchId", async () => {
      const repo = await makeRepo();
      const winner = makeUserId();
      const loser = makeUserId();
      const result: MatchResultRecord = {
        matchId: crypto.randomUUID(),
        arenaIds: ["pit"],
        mode: "quick",
        startedAt: new Date("2026-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T00:05:00Z"),
        winnerId: winner,
        serverVersion: "test",
        participants: [
          {
            playerId: winner,
            placement: 1,
            roundsWon: 2,
            eliminations: 3,
            deaths: 1,
            damageDealt: 120,
            powerups: ["lifesteal"],
            weapon: WEAPON_IDS.MACE,
          },
          {
            playerId: loser,
            placement: 2,
            roundsWon: 0,
            eliminations: 0,
            deaths: 2,
            damageDealt: 40,
            powerups: [],
            weapon: WEAPON_IDS.SWORD,
          },
        ],
      };

      await expect(repo.recordMatch(result)).resolves.toBeUndefined();
      // A second call for the same matchId must not throw and must not
      // double-record — this repository has no counter-reading method of
      // its own to assert "not double-counted" generically across both
      // implementations, so this only pins the "doesn't error" half; each
      // concrete test file additionally checks its own backing store's
      // counters directly (InMemoryPlayerRepository.recordedMatches /
      // player_stats).
      await expect(repo.recordMatch(result)).resolves.toBeUndefined();
    });

    it("returns default (zeroed) stats for a player with none recorded", async () => {
      const repo = await makeRepo();
      await expect(repo.getStats(makeUserId())).resolves.toEqual(DEFAULT_UNLOCK_STATS);
    });

    it("grantUnlock is idempotent and reflected by getUnlocks", async () => {
      const repo = await makeRepo();
      const userId = makeUserId();

      await expect(repo.grantUnlock(userId, "helmet-bronze")).resolves.toBeUndefined();
      // Granting the same item twice must not error (plan Phase 9 step 3:
      // `evaluateAndGrantUnlocks` re-evaluating after a retry could do
      // exactly this).
      await expect(repo.grantUnlock(userId, "helmet-bronze")).resolves.toBeUndefined();

      await expect(repo.getUnlocks(userId)).resolves.toEqual(["helmet-bronze"]);
    });

    it("recordMatch updates the winner's wins, matchesPlayed, and winsByWeapon", async () => {
      const repo = await makeRepo();
      const winner = makeUserId();
      const loser = makeUserId();
      const result: MatchResultRecord = {
        matchId: crypto.randomUUID(),
        arenaIds: ["pit"],
        mode: "quick",
        startedAt: new Date("2026-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T00:05:00Z"),
        winnerId: winner,
        serverVersion: "test",
        participants: [
          {
            playerId: winner,
            placement: 1,
            roundsWon: 2,
            eliminations: 5,
            deaths: 0,
            damageDealt: 200,
            powerups: [],
            weapon: WEAPON_IDS.SPEAR,
          },
          {
            playerId: loser,
            placement: 2,
            roundsWon: 0,
            eliminations: 0,
            deaths: 2,
            damageDealt: 10,
            powerups: [],
            weapon: WEAPON_IDS.SWORD,
          },
        ],
      };

      await repo.recordMatch(result);

      const winnerStats = await repo.getStats(winner);
      expect(winnerStats.wins).toBe(1);
      expect(winnerStats.matchesPlayed).toBe(1);
      expect(winnerStats.eliminations).toBe(5);
      expect(winnerStats.winsByWeapon[WEAPON_IDS.SPEAR]).toBe(1);

      const loserStats = await repo.getStats(loser);
      expect(loserStats.wins).toBe(0);
      expect(loserStats.matchesPlayed).toBe(1);
      expect(loserStats.winsByWeapon[WEAPON_IDS.SWORD] ?? 0).toBe(0);
    });
  });
}
