/**
 * Cosmetic catalog types (plan Phase 8 step 1). `player_loadouts.helmet_id`/
 * `cape_id`/`weapon_style_id` are validated against `player_unlocks` by RLS
 * (`supabase/migrations/*_loadouts_and_unlocks.sql`), not against this
 * catalog — this just gives both ends of the isomorphic boundary a shared
 * shape for whatever a cosmetic item *is*, the same way `./testing`'s
 * subpath export existed as an empty placeholder since Phase 1 before
 * Phase 3 filled it in. `COSMETIC_CATALOG` is empty on purpose: no cosmetic
 * items exist yet — Phase 9 ("Customization and Stats UI") is where a real
 * catalog and the unlock-granting flow that populates `player_unlocks` get
 * built.
 */
export const COSMETIC_SLOTS = {
  HELMET: "helmet",
  CAPE: "cape",
  WEAPON_STYLE: "weaponStyle",
} as const;

export type CosmeticSlot = (typeof COSMETIC_SLOTS)[keyof typeof COSMETIC_SLOTS];

export interface CosmeticItem {
  readonly id: string;
  readonly slot: CosmeticSlot;
  readonly name: string;
}

export const COSMETIC_CATALOG: readonly CosmeticItem[] = [];
