export type { Database, Json } from "./database.types.js";
export * from "./cosmetics.js";

import type { Database } from "./database.types.js";

/** `supabase gen types typescript --local` (plan Phase 8 step 4) — never
 *  hand-edit `database.types.ts`; regenerate it after any migration
 *  changes the `public` schema (`supabase db reset` then `supabase gen
 *  types typescript --local > packages/shared/src/db/database.types.ts`).
 *  These are the row shapes `PlayerRepository` (apps/server) and any future
 *  client-side loadout/stats UI (Phase 9) both need without importing
 *  `@supabase/supabase-js` themselves — `packages/shared` stays isomorphic
 *  (ADR 0001; enforced by `oxlint.config.ts`'s `no-restricted-imports`
 *  override on `@supabase/*`), so only the row *types* live here, never a
 *  Supabase client. */
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type PlayerLoadout = Database["public"]["Tables"]["player_loadouts"]["Row"];
export type PlayerUnlock = Database["public"]["Tables"]["player_unlocks"]["Row"];
export type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
export type MatchParticipantRow = Database["public"]["Tables"]["match_participants"]["Row"];
export type PlayerStatsRow = Database["public"]["Tables"]["player_stats"]["Row"];
export type LeaderboardRow = Database["public"]["Views"]["leaderboard"]["Row"];
