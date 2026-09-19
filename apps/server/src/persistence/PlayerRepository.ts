import { WEAPON_IDS, type UnlockStats, type WeaponId } from "@castle-clash/shared";

/** A player's persisted gameplay/cosmetic choices (plan Phase 8 step 2's
 *  `player_loadouts` row). `helmetId`/`capeId`/`weaponStyleId` are `null`
 *  for "no cosmetic equipped" — there's no separate sentinel string, and
 *  `null` is always a valid loadout regardless of what's in
 *  `player_unlocks` (see the RLS policies in
 *  `supabase/migrations/*_loadouts_and_unlocks.sql`). */
export interface Loadout {
  readonly weapon: WeaponId;
  readonly tintPrimary: number;
  readonly tintSecondary: number;
  readonly helmetId: string | null;
  readonly capeId: string | null;
  readonly weaponStyleId: string | null;
}

/** What a brand-new player (no `player_loadouts` row yet) gets — the same
 *  defaults `player_loadouts`'s own column defaults describe in SQL, kept
 *  in sync by hand since `Loadout` isn't generated from the DB schema. */
export const DEFAULT_LOADOUT: Loadout = {
  weapon: WEAPON_IDS.SWORD,
  tintPrimary: 0,
  tintSecondary: 0,
  helmetId: null,
  capeId: null,
  weaponStyleId: null,
};

export interface MatchParticipantResult {
  readonly playerId: string;
  readonly placement: number;
  readonly roundsWon: number;
  readonly eliminations: number;
  readonly deaths: number;
  readonly damageDealt: number;
  readonly powerups: readonly string[];
  /** The weapon this participant actually played the match with (plan
   *  Phase 9 step 3: `winWithWeapon`'s unlock rule needs a per-weapon win
   *  tally, which needs to know this per match). `MatchRoom` reads it from
   *  a map populated at `onJoin` from that player's loadout, not from
   *  `SimState.players` directly — the latter is deleted on `onLeave`, so a
   *  participant who left before `MatchOver` would otherwise have none. */
  readonly weapon: WeaponId;
}

/** What a brand-new player (no `player_stats` row yet) gets — mirrors
 *  `DEFAULT_LOADOUT`'s reasoning below: `player_stats`'s own column
 *  defaults, kept in sync by hand since `UnlockStats` isn't generated from
 *  the DB schema. */
export const DEFAULT_UNLOCK_STATS: UnlockStats = {
  wins: 0,
  eliminations: 0,
  matchesPlayed: 0,
  winsByWeapon: {},
};

/** One completed match's full record (plan Phase 8 step 5: `MatchOver` ->
 *  `recordMatch`). `matchId` is generated once at room creation (not here)
 *  specifically so a retried `recordMatch` call after a transient failure
 *  is idempotent — both `record_match_result()` (Supabase) and
 *  `InMemoryPlayerRepository` key on it for exactly that reason. */
export interface MatchResultRecord {
  readonly matchId: string;
  readonly arenaIds: readonly string[];
  readonly mode: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly winnerId: string | null;
  readonly serverVersion: string;
  readonly participants: readonly MatchParticipantResult[];
}

/**
 * The one seam between gameplay code and however player identity/loadout/
 * match-history persistence actually happens (plan Phase 8 step 5) — a
 * `Room` or `MatchDirector` never imports `@supabase/supabase-js` directly,
 * so swapping `SupabasePlayerRepository` for `InMemoryPlayerRepository` (or
 * a future third implementation) never touches gameplay code.
 */
export interface PlayerRepository {
  getLoadout(userId: string): Promise<Loadout>;
  getUnlocks(userId: string): Promise<readonly string[]>;
  /** The player's chosen `profiles.display_name`, or `null` when they have
   *  none (every guest, and any account that never picked one). Callers fall
   *  back to `guestDisplayName(userId)` for display; `null` is not an error. */
  getDisplayName(userId: string): Promise<string | null>;
  /** Idempotent on `result.matchId` — calling this twice for the same
   *  match must not double-count `player_stats` (this is what makes a
   *  retry-with-backoff queue on top of this safe). */
  recordMatch(result: MatchResultRecord): Promise<void>;
  /** The stats `evaluateUnlocks()` (shared) checks unlock thresholds
   *  against — read fresh after `recordMatch` succeeds (plan Phase 9 step
   *  3), so it reflects the match that might have just crossed one. */
  getStats(userId: string): Promise<UnlockStats>;
  /** Idempotent: granting an already-owned item is a no-op, not an error —
   *  `evaluateAndGrantUnlocks` (apps/server/src/match/unlocks.ts) never
   *  checks `getUnlocks` immediately beforehand for every item, so this is
   *  what actually makes a duplicate grant (e.g. from re-evaluating after a
   *  retried `recordMatch`) safe. */
  grantUnlock(userId: string, itemId: string): Promise<void>;
}
