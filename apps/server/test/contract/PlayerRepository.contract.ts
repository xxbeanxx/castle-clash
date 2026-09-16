import type { MatchResultRecord, PlayerRepository } from "../../src/persistence/PlayerRepository.js";
import { DEFAULT_LOADOUT } from "../../src/persistence/PlayerRepository.js";
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
          },
          {
            playerId: loser,
            placement: 2,
            roundsWon: 0,
            eliminations: 0,
            deaths: 2,
            damageDealt: 40,
            powerups: [],
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
  });
}
