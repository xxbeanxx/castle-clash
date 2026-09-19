import type { PlayerId } from "../types/ids.js";

/** The DTO `MatchDirector` emits at `MatchOver` and `MatchRoom` broadcasts —
 *  lives in `shared`, not `server`, so the client can read it off the wire
 *  without importing across the isomorphic boundary (ADR 0001). */
export interface MatchStatsEntry {
  eliminations: number;
  deaths: number;
  damageDealt: number;
  roundsWon: number;
}

export interface MatchResult {
  winner: PlayerId | null;
  rounds: number;
  stats: Readonly<Record<PlayerId, MatchStatsEntry>>;
  /** Display name per participant, including anyone who left before the end
   *  (their `PlayerState` is already gone from the room by then). Optional so
   *  a client still reads a result from a server that predates Phase 12. */
  names?: Readonly<Record<PlayerId, string>>;
}
