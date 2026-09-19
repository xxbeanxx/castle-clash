import { WEAPON_IDS, type WeaponId } from "../types/ids.js";

/**
 * Cosmetic catalog types and unlock rules (plan Phase 9 step 1).
 * `player_loadouts.helmet_id`/`cape_id`/`weapon_style_id` are validated
 * against `player_unlocks` by RLS (`supabase/migrations/
 * *_loadouts_and_unlocks.sql`) for *persistence*; `MatchRoom.onJoin`
 * additionally re-validates a loaded selection against this catalog and the
 * player's own `player_unlocks` before ever writing it to `PlayerState.
 * cosmetics` (an item since removed from the catalog, or a stale/spoofed id
 * that slipped past RLS some other way, silently falls back to that slot's
 * `default` item rather than propagating to schema).
 */
export const COSMETIC_SLOTS = {
  HELMET: "helmet",
  CAPE: "cape",
  WEAPON_STYLE: "weaponStyle",
} as const;

export type CosmeticSlot = (typeof COSMETIC_SLOTS)[keyof typeof COSMETIC_SLOTS];

/**
 * A closed union of unlock conditions. `evaluateUnlocks` below is the only
 * place any of these are interpreted — adding a new variant means adding a
 * case there, which its `switch`'s exhaustiveness check enforces.
 */
export type UnlockRule =
  | { readonly type: "default" }
  | { readonly type: "wins"; readonly n: number }
  | { readonly type: "eliminations"; readonly n: number }
  | { readonly type: "matchesPlayed"; readonly n: number }
  | { readonly type: "winWithWeapon"; readonly weapon: WeaponId; readonly n: number };

/**
 * No spritesheet/texture-atlas pipeline exists anywhere in this repo (see
 * `docs/research/phase4-knight-rendering-deviation.md`, the same gap Phase
 * 9 inherits — recorded again in `docs/research/
 * phase9-cosmetics-rendering-deviation.md`): the plan's `textureKey` field
 * assumes real knight art this codebase has never had. `tint` is this
 * catalog's stand-in — a 24-bit RGB int `render/PlayerRects.ts` applies to
 * a small indicator rect layered on top of a player's body rect, the same
 * "tint, not texture" idiom Phase 2 established for the body itself. The
 * `default` item per slot has no tint: equipping it means "draw nothing for
 * this slot," not "draw it in some particular color."
 */
export interface CosmeticItem {
  readonly id: string;
  readonly slot: CosmeticSlot;
  readonly name: string;
  readonly unlock: UnlockRule;
  readonly tint?: number;
}

export const COSMETIC_CATALOG: readonly CosmeticItem[] = [
  {
    id: "helmet-none",
    slot: COSMETIC_SLOTS.HELMET,
    name: "Bare Head",
    unlock: { type: "default" },
  },
  {
    id: "helmet-bronze",
    slot: COSMETIC_SLOTS.HELMET,
    name: "Bronze Helm",
    unlock: { type: "matchesPlayed", n: 5 },
    tint: 0xcd7f32,
  },
  {
    id: "helmet-silver",
    slot: COSMETIC_SLOTS.HELMET,
    name: "Silver Helm",
    unlock: { type: "wins", n: 10 },
    tint: 0xc0c0c0,
  },
  {
    id: "helmet-gold",
    slot: COSMETIC_SLOTS.HELMET,
    name: "Gold Helm",
    unlock: { type: "wins", n: 25 },
    tint: 0xffd700,
  },
  { id: "cape-none", slot: COSMETIC_SLOTS.CAPE, name: "No Cape", unlock: { type: "default" } },
  {
    id: "cape-tattered",
    slot: COSMETIC_SLOTS.CAPE,
    name: "Tattered Cape",
    unlock: { type: "matchesPlayed", n: 3 },
    tint: 0x8b7355,
  },
  {
    id: "cape-crimson",
    slot: COSMETIC_SLOTS.CAPE,
    name: "Crimson Cape",
    unlock: { type: "eliminations", n: 20 },
    tint: 0xdc143c,
  },
  {
    id: "cape-royal",
    slot: COSMETIC_SLOTS.CAPE,
    name: "Royal Cape",
    unlock: { type: "wins", n: 15 },
    tint: 0x4b0082,
  },
  {
    id: "weaponStyle-none",
    slot: COSMETIC_SLOTS.WEAPON_STYLE,
    name: "Standard",
    unlock: { type: "default" },
  },
  {
    id: "weaponStyle-sword-etched",
    slot: COSMETIC_SLOTS.WEAPON_STYLE,
    name: "Etched Blade",
    unlock: { type: "winWithWeapon", weapon: WEAPON_IDS.SWORD, n: 5 },
    tint: 0x00ced1,
  },
  {
    id: "weaponStyle-mace-spiked",
    slot: COSMETIC_SLOTS.WEAPON_STYLE,
    name: "Spiked Mace",
    unlock: { type: "winWithWeapon", weapon: WEAPON_IDS.MACE, n: 5 },
    tint: 0x8b0000,
  },
  {
    id: "weaponStyle-spear-barbed",
    slot: COSMETIC_SLOTS.WEAPON_STYLE,
    name: "Barbed Spear",
    unlock: { type: "winWithWeapon", weapon: WEAPON_IDS.SPEAR, n: 5 },
    tint: 0x2f4f4f,
  },
];

/** Every field a `COSMETIC_CATALOG` unlock rule can be checked against —
 *  `wins`/`eliminations`/`matchesPlayed` mirror `player_stats` columns
 *  directly; `winsByWeapon` is `player_stats.wins_by_weapon` (a per-weapon
 *  win tally added in Phase 9's migration specifically so `winWithWeapon`
 *  is checkable at all — see `supabase/migrations/*_cosmetics_and_stats.sql`).
 *  A plain object keyed by `WeaponId`, not `Record<WeaponId, number>`,
 *  because a player with zero wins on a given weapon simply has no key for
 *  it rather than an explicit `0`. */
export interface UnlockStats {
  readonly wins: number;
  readonly eliminations: number;
  readonly matchesPlayed: number;
  readonly winsByWeapon: Readonly<Partial<Record<WeaponId, number>>>;
}

function meetsRule(rule: UnlockRule, stats: UnlockStats): boolean {
  switch (rule.type) {
    case "default":
      return false;
    case "wins":
      return stats.wins >= rule.n;
    case "eliminations":
      return stats.eliminations >= rule.n;
    case "matchesPlayed":
      return stats.matchesPlayed >= rule.n;
    case "winWithWeapon":
      return (stats.winsByWeapon[rule.weapon] ?? 0) >= rule.n;
  }
}

/**
 * Pure function (plan Phase 9 testing strategy): every catalog item whose
 * `unlock` rule `stats` now satisfies and that isn't already in `owned`.
 * `default` items are never emitted — they need no unlocking, and a caller
 * that also treats "no rows in `player_unlocks`" as owning every `default`
 * item never asks this function about them in the first place.
 */
export function evaluateUnlocks(stats: UnlockStats, owned: readonly string[]): string[] {
  const ownedSet = new Set(owned);
  const unlocked: string[] = [];
  for (const item of COSMETIC_CATALOG) {
    if (ownedSet.has(item.id)) {
      continue;
    }
    if (meetsRule(item.unlock, stats)) {
      unlocked.push(item.id);
    }
  }
  return unlocked;
}

/** The render tint for an equipped `COSMETIC_CATALOG` item id, or
 *  `undefined` for an unknown id or a slot's `default` item (which has no
 *  `tint` — "equip nothing," not "equip a particular color"). Used by both
 *  `render/PlayerRects.ts` (a match's in-world indicator rects) and the
 *  loadout route's live preview — the one place either reads a cosmetic
 *  item's color from. */
export function getCosmeticTint(itemId: string): number | undefined {
  return COSMETIC_CATALOG.find((item) => item.id === itemId)?.tint;
}

/**
 * A player's raw `helmetId`/`capeId`/`weaponStyleId` selection re-validated
 * against the catalog and their own unlocks (plan Phase 9 step 3: "invalid
 * -> default"). `null` (no selection) always resolves to that slot's
 * `default` item's id. Unknown-slot lookups can't happen — every id passed
 * in came from a `player_loadouts` column whose RLS check already pins its
 * slot — but a removed catalog item or an id from another slot both count
 * as "unowned" here and fall back the same way.
 */
export function resolveCosmeticSelection(
  slot: CosmeticSlot,
  selectedId: string | null,
  owned: readonly string[],
): string {
  const defaultItem = COSMETIC_CATALOG.find(
    (item) => item.slot === slot && item.unlock.type === "default",
  );
  if (!defaultItem) {
    throw new Error(`no default cosmetic item for slot "${slot}"`);
  }
  if (!selectedId) {
    return defaultItem.id;
  }
  const item = COSMETIC_CATALOG.find(
    (candidate) => candidate.id === selectedId && candidate.slot === slot,
  );
  if (!item) {
    return defaultItem.id;
  }
  if (item.unlock.type !== "default" && !owned.includes(item.id)) {
    return defaultItem.id;
  }
  return item.id;
}
