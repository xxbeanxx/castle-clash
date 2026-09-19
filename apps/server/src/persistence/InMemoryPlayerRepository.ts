import type { UnlockStats, WeaponId } from "@castle-clash/shared";
import {
  DEFAULT_LOADOUT,
  DEFAULT_UNLOCK_STATS,
  type Loadout,
  type MatchResultRecord,
  type PlayerRepository,
} from "./PlayerRepository.js";

/**
 * A dependency-free `PlayerRepository` for tests and local dev without
 * Supabase running (same role as `ManualTickDriver`/`TickDriver` — a real
 * implementation, not a mock, since gameplay code can't tell the
 * difference). `recordedMatches` is public specifically so
 * `MatchRoom.auth.test.ts` can assert on exactly what a completed match
 * recorded without needing a mocking library.
 */
export class InMemoryPlayerRepository implements PlayerRepository {
  readonly #loadouts = new Map<string, Loadout>();
  readonly #unlocks = new Map<string, Set<string>>();
  readonly #stats = new Map<string, UnlockStats>();
  readonly recordedMatches = new Map<string, MatchResultRecord>();

  async getLoadout(userId: string): Promise<Loadout> {
    return this.#loadouts.get(userId) ?? DEFAULT_LOADOUT;
  }

  async getUnlocks(userId: string): Promise<readonly string[]> {
    return [...(this.#unlocks.get(userId) ?? [])];
  }

  async getStats(userId: string): Promise<UnlockStats> {
    return this.#stats.get(userId) ?? DEFAULT_UNLOCK_STATS;
  }

  async grantUnlock(userId: string, itemId: string): Promise<void> {
    const owned = this.#unlocks.get(userId) ?? new Set<string>();
    owned.add(itemId);
    this.#unlocks.set(userId, owned);
  }

  async recordMatch(result: MatchResultRecord): Promise<void> {
    // Mirrors `record_match_result()`'s own idempotency: a conflict on the
    // match id is a silent no-op, not an error, so a retry queue calling
    // this twice for the same match can't double-count.
    if (this.recordedMatches.has(result.matchId)) {
      return;
    }
    this.recordedMatches.set(result.matchId, result);

    for (const participant of result.participants) {
      const prev = this.#stats.get(participant.playerId) ?? DEFAULT_UNLOCK_STATS;
      const won = participant.placement === 1;
      const winsByWeapon: Partial<Record<WeaponId, number>> = { ...prev.winsByWeapon };
      if (won) {
        winsByWeapon[participant.weapon] = (winsByWeapon[participant.weapon] ?? 0) + 1;
      }
      this.#stats.set(participant.playerId, {
        wins: prev.wins + (won ? 1 : 0),
        eliminations: prev.eliminations + participant.eliminations,
        matchesPlayed: prev.matchesPlayed + 1,
        winsByWeapon,
      });
    }
  }

  /** Test-only setup helper — seeds a loadout as if it had been persisted
   *  earlier, without going through a save flow this phase doesn't build. */
  seedLoadout(userId: string, loadout: Loadout): void {
    this.#loadouts.set(userId, loadout);
  }

  /** Test-only setup helper — mirrors `seedLoadout` for unlocks. */
  seedUnlocks(userId: string, itemIds: readonly string[]): void {
    this.#unlocks.set(userId, new Set(itemIds));
  }

  /** Test-only setup helper — mirrors `seedLoadout`/`seedUnlocks` for
   *  stats, so a unit test can put a player one win away from an unlock
   *  threshold without playing out real matches. */
  seedStats(userId: string, stats: UnlockStats): void {
    this.#stats.set(userId, stats);
  }
}
