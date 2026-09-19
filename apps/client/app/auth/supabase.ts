import {
  isWeaponId,
  WEAPON_IDS,
  type Database,
  type LeaderboardRow,
  type WeaponId,
} from "@castle-clash/shared";
import { createClient, type Session } from "@supabase/supabase-js";
import { getRuntimeConfig } from "../config/runtime.js";

/**
 * The ONLY module in `apps/client` that imports `@supabase/supabase-js`
 * (plan Phase 8 step 6) — every route/component that needs auth OR
 * loadout/stats/leaderboard data (Phase 9) calls the functions below
 * instead, so `vi.mock("../auth/supabase.js")` is the one seam a route test
 * needs to fake sign-in state or query results, with no supabase-js
 * internals to know about.
 */

let cached: ReturnType<typeof createClient<Database>> | null = null;

function client(): ReturnType<typeof createClient<Database>> {
  if (!cached) {
    const config = getRuntimeConfig();
    cached = createClient<Database>(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  }
  return cached;
}

/** Every data-access function below needs the caller's own id (RLS scopes
 *  every query to it anyway, but `upsert`/`.eq()` both need it named
 *  explicitly). Throws rather than silently no-op'ing: every call site is
 *  reached from a `clientLoader`-guarded route (`requireSession` already
 *  ran), so a missing session here means that invariant broke, not a
 *  normal runtime case. */
async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new Error("expected an active session — this route should be clientLoader-guarded");
  }
  return session.user.id;
}

export type { Session };

export async function getSession(): Promise<Session | null> {
  const { data } = await client().auth.getSession();
  return data.session;
}

/** The bearer token `GameClient.start()` forwards to `MatchRoom.onAuth`.
 *  Always re-reads the current session rather than caching a token itself
 *  — `supabase-js` silently refreshes an expiring access token underneath
 *  `getSession()`, so calling this fresh right before every join (plan step
 *  6: "refreshed before reconnecting") never risks sending a stale one. */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  const {
    data: { subscription },
  } = client().auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

/** Magic-link sign-in — also the upgrade path for an anonymous guest: per
 *  Supabase's own anonymous-user docs, calling this while signed in
 *  anonymously LINKS the email to the existing (same-id) user instead of
 *  creating a new one, so a guest's `player_stats` row (keyed on that same
 *  id) survives the upgrade untouched. */
export async function signInWithMagicLink(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({ email });
  if (error) {
    throw error;
  }
}

/** Google only: Discord was removed (plan decision D8) until it is configured
 *  end to end on the hosted project. */
export type OAuthProvider = "google";

export async function signInWithOAuth(provider: OAuthProvider): Promise<void> {
  // Back to /login specifically, not just the origin: it's the one route
  // that watches `onAuthStateChange` and navigates onward once the
  // redirect hands back a session (see routes/login.tsx's doc comment).
  const { error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/login` },
  });
  if (error) {
    throw error;
  }
}

export async function signInAsGuest(): Promise<void> {
  const { error } = await client().auth.signInAnonymously();
  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  await client().auth.signOut();
}

/** Mirrors `apps/server/src/persistence/PlayerRepository.ts`'s `Loadout` —
 *  a separate type (not shared) because the client never imports
 *  server-only code, but the shape is deliberately identical. */
export interface ClientLoadout {
  readonly weapon: WeaponId;
  readonly tintPrimary: number;
  readonly tintSecondary: number;
  readonly helmetId: string | null;
  readonly capeId: string | null;
  readonly weaponStyleId: string | null;
}

const DEFAULT_CLIENT_LOADOUT: ClientLoadout = {
  weapon: WEAPON_IDS.SWORD,
  tintPrimary: 0,
  tintSecondary: 0,
  helmetId: null,
  capeId: null,
  weaponStyleId: null,
};

/** Reads the signed-in player's own `player_loadouts` row (RLS: "players
 *  can view their own loadout"). A brand-new player has no row yet, not an
 *  error — mirrors `DEFAULT_LOADOUT`'s reasoning server-side. */
export async function getMyLoadout(): Promise<ClientLoadout> {
  const userId = await requireUserId();
  const { data, error } = await client()
    .from("player_loadouts")
    .select("weapon, tint_primary, tint_secondary, helmet_id, cape_id, weapon_style_id")
    .eq("player_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return DEFAULT_CLIENT_LOADOUT;
  }
  return {
    weapon: isWeaponId(data.weapon) ? data.weapon : DEFAULT_CLIENT_LOADOUT.weapon,
    tintPrimary: data.tint_primary,
    tintSecondary: data.tint_secondary,
    helmetId: data.helmet_id,
    capeId: data.cape_id,
    weaponStyleId: data.weapon_style_id,
  };
}

/** Upserts the signed-in player's own `player_loadouts` row (plan Phase 9
 *  step 4: "saves via supabase-js upsert, and RLS enforces ownership") —
 *  RLS's `player_owns_cosmetics()` check rejects an unowned `helmetId`/
 *  `capeId`/`weaponStyleId` outright (a Postgres error this function lets
 *  propagate), not a silent fallback — the loadout route is expected to
 *  only ever offer owned items as selectable in the first place. */
export async function saveMyLoadout(loadout: ClientLoadout): Promise<void> {
  const userId = await requireUserId();
  const { error } = await client().from("player_loadouts").upsert({
    player_id: userId,
    weapon: loadout.weapon,
    tint_primary: loadout.tintPrimary,
    tint_secondary: loadout.tintSecondary,
    helmet_id: loadout.helmetId,
    cape_id: loadout.capeId,
    weapon_style_id: loadout.weaponStyleId,
  });

  if (error) {
    throw error;
  }
}

/** The signed-in player's own `player_unlocks.item_id`s (RLS: "players can
 *  view their own unlocks") — what the loadout route uses to decide which
 *  catalog items are selectable vs. lock-badged. */
export async function getMyUnlocks(): Promise<string[]> {
  const userId = await requireUserId();
  const { data, error } = await client()
    .from("player_unlocks")
    .select("item_id")
    .eq("player_id", userId);

  if (error) {
    throw error;
  }
  return data.map((row) => row.item_id);
}

export interface ClientStats {
  readonly matchesPlayed: number;
  readonly wins: number;
  readonly eliminations: number;
  readonly deaths: number;
  readonly roundsWon: number;
}

const ZERO_STATS: ClientStats = {
  matchesPlayed: 0,
  wins: 0,
  eliminations: 0,
  deaths: 0,
  roundsWon: 0,
};

/** Reads the signed-in player's own `player_stats` row via the "players can
 *  view their own stats" RLS policy added in Phase 9's migration —
 *  `player_stats` otherwise default-denies every direct select (Phase 8),
 *  since `public.leaderboard` exposes `display_name`, not `player_id`, and
 *  so can't answer "what are MY counters" at all. A brand-new player has no
 *  row yet, not an error. */
export async function getMyStats(): Promise<ClientStats> {
  const userId = await requireUserId();
  const { data, error } = await client()
    .from("player_stats")
    .select("matches_played, wins, eliminations, deaths, rounds_won")
    .eq("player_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return ZERO_STATS;
  }
  return {
    matchesPlayed: data.matches_played,
    wins: data.wins,
    eliminations: data.eliminations,
    deaths: data.deaths,
    roundsWon: data.rounds_won,
  };
}

export interface MatchHistoryEntry {
  readonly matchId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly placement: number;
  readonly roundsWon: number;
  readonly eliminations: number;
  readonly deaths: number;
  readonly damageDealt: number;
  readonly weapon: string;
  readonly won: boolean;
}

/** The signed-in player's most recent matches (plan Phase 9 step 4: "the
 *  last 20 matches from match_participants"), newest first. `matches` has
 *  an open "authenticated users can view match history" select policy
 *  (Phase 8) — reading another player's `match_participants` row is
 *  allowed by RLS too, but this always filters to `player_id = userId`, so
 *  a player only ever sees their own match list. */
export async function getMyMatchHistory(limit = 20): Promise<MatchHistoryEntry[]> {
  const userId = await requireUserId();
  const { data, error } = await client()
    .from("match_participants")
    .select(
      "match_id, placement, rounds_won, eliminations, deaths, damage_dealt, weapon, matches(started_at, ended_at)",
    )
    .eq("player_id", userId)
    .order("started_at", { referencedTable: "matches", ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data
    .filter((row) => row.matches !== null)
    .map((row) => ({
      matchId: row.match_id,
      startedAt: row.matches!.started_at,
      endedAt: row.matches!.ended_at,
      placement: row.placement,
      roundsWon: row.rounds_won,
      eliminations: row.eliminations,
      deaths: row.deaths,
      damageDealt: row.damage_dealt,
      weapon: row.weapon,
      won: row.placement === 1,
    }));
}

/** A page of `public.leaderboard`, ordered by wins (plan Phase 9 step 4:
 *  "reads the leaderboard view with pagination") — `offset`/`limit` map
 *  straight onto PostgREST's `range()`.
 *
 *  Only players with a display name are ranked: the page is public (readable
 *  with no session), and guests have no name, so listing them would print
 *  "Anonymous" rows and put a stranger's throwaway account on a public board.
 *  Filtering in the query, not after, keeps `range()` pagination exact. This is
 *  the v2 plan's decision D3 taken in its least-committal form (no migration);
 *  drop the `.not()` to list everyone. */
export async function getLeaderboard(offset: number, limit: number): Promise<LeaderboardRow[]> {
  const { data, error } = await client()
    .from("leaderboard")
    .select("display_name, matches_played, wins, eliminations, deaths, rounds_won")
    .not("display_name", "is", null)
    .order("wins", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }
  return data;
}
