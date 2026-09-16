import { WEAPON_IDS, type Database, type WeaponId } from "@castle-clash/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_LOADOUT,
  type Loadout,
  type MatchResultRecord,
  type PlayerRepository,
} from "./PlayerRepository.js";

function isWeaponId(value: string): value is WeaponId {
  return (Object.values(WEAPON_IDS) as string[]).includes(value);
}

/**
 * The real implementation, backed by Supabase Postgres via a
 * `service_role`-keyed client (constructed by the caller — this class never
 * reads env vars itself, so a test can point it at a local instance's own
 * secret key). Every write goes through `record_match_result()`, the one
 * `security definer` RPC granted to `service_role` (plan Phase 8 step 2) —
 * this class never inserts into `matches`/`match_participants`/
 * `player_stats` directly, so the transactional/idempotent guarantees live
 * in exactly one place (the SQL function), not duplicated here.
 */
export class SupabasePlayerRepository implements PlayerRepository {
  readonly #client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database>) {
    this.#client = client;
  }

  async getLoadout(userId: string): Promise<Loadout> {
    const { data, error } = await this.#client
      .from("player_loadouts")
      .select("weapon, tint_primary, tint_secondary, helmet_id, cape_id, weapon_style_id")
      .eq("player_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`getLoadout(${userId}) failed: ${error.message}`);
    }
    if (!data) {
      return DEFAULT_LOADOUT;
    }

    return {
      weapon: isWeaponId(data.weapon) ? data.weapon : DEFAULT_LOADOUT.weapon,
      tintPrimary: data.tint_primary,
      tintSecondary: data.tint_secondary,
      helmetId: data.helmet_id,
      capeId: data.cape_id,
      weaponStyleId: data.weapon_style_id,
    };
  }

  async getUnlocks(userId: string): Promise<readonly string[]> {
    const { data, error } = await this.#client.from("player_unlocks").select("item_id").eq("player_id", userId);

    if (error) {
      throw new Error(`getUnlocks(${userId}) failed: ${error.message}`);
    }
    return data.map((row) => row.item_id);
  }

  async recordMatch(result: MatchResultRecord): Promise<void> {
    const { error } = await this.#client.rpc("record_match_result", {
      payload: {
        matchId: result.matchId,
        arenaIds: [...result.arenaIds],
        mode: result.mode,
        startedAt: result.startedAt.toISOString(),
        endedAt: result.endedAt.toISOString(),
        winnerId: result.winnerId,
        serverVersion: result.serverVersion,
        participants: result.participants.map((p) => ({
          playerId: p.playerId,
          placement: p.placement,
          roundsWon: p.roundsWon,
          eliminations: p.eliminations,
          deaths: p.deaths,
          damageDealt: p.damageDealt,
          powerups: [...p.powerups],
        })),
      },
    });

    if (error) {
      throw new Error(`recordMatch(${result.matchId}) failed: ${error.message}`);
    }
  }
}
