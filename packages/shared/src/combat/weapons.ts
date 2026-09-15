import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../config/game.js";
import type { AABB } from "../math/aabb.js";
import type { Vec } from "../math/vec.js";
import { WEAPON_IDS, type WeaponId } from "../types/ids.js";
import type { AttackKind } from "./types.js";

/** A hitbox active on one tick within an attack's Active phase, in
 *  facing-relative coordinates (mirrored onto world space by
 *  `resolve.ts` for `facing === -1`). */
export interface AttackHitbox {
  tickOffset: number;
  box: AABB;
}

export interface AttackDef {
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  staminaDamage: number;
  knockback: Vec;
  hitstun: number;
  hitboxes: readonly AttackHitbox[];
}

export interface WeaponDef {
  id: WeaponId;
  reach: number;
  light: AttackDef;
  heavy: AttackDef;
  /** How many lights can chain back-to-back from AttackRecovery before it
   *  must return to a neutral state (the Sword's "light chains x2" trait). */
  lightChainLimit: number;
}

/** One hitbox per active tick, all sharing the same facing-relative box —
 *  frame data doesn't need a swept/growing hitbox for Phase 4's MVP weapons. */
function activeEveryTick(active: number, box: AABB): AttackHitbox[] {
  return Array.from({ length: active }, (_, tickOffset) => ({ tickOffset, box }));
}

/** The swing box for a weapon of `reach`, facing right (`facing === 1`):
 *  starts at the player's leading edge and extends `reach` further, full
 *  player height. */
function reachBox(reach: number): AABB {
  return { x: PLAYER_WIDTH, y: 0, w: reach, h: PLAYER_HEIGHT };
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  [WEAPON_IDS.SWORD]: {
    id: WEAPON_IDS.SWORD,
    reach: 70,
    lightChainLimit: 2,
    light: {
      startup: 6,
      active: 4,
      recovery: 12,
      damage: 7,
      staminaDamage: 10,
      knockback: { x: 120, y: -40 },
      hitstun: 10,
      hitboxes: activeEveryTick(4, reachBox(70)),
    },
    heavy: {
      startup: 16,
      active: 5,
      recovery: 22,
      damage: 16,
      staminaDamage: 20,
      knockback: { x: 220, y: -80 },
      hitstun: 18,
      hitboxes: activeEveryTick(5, reachBox(70)),
    },
  },
  [WEAPON_IDS.MACE]: {
    id: WEAPON_IDS.MACE,
    reach: 55,
    lightChainLimit: 1,
    light: {
      startup: 9,
      active: 4,
      recovery: 16,
      damage: 9,
      staminaDamage: 14,
      knockback: { x: 140, y: -40 },
      hitstun: 12,
      hitboxes: activeEveryTick(4, reachBox(55)),
    },
    heavy: {
      startup: 24,
      active: 6,
      recovery: 30,
      damage: 20,
      staminaDamage: 45,
      knockback: { x: 260, y: -100 },
      hitstun: 22,
      hitboxes: activeEveryTick(6, reachBox(55)),
    },
  },
  [WEAPON_IDS.SPEAR]: {
    id: WEAPON_IDS.SPEAR,
    reach: 110,
    lightChainLimit: 1,
    light: {
      startup: 8,
      active: 3,
      recovery: 14,
      damage: 6,
      staminaDamage: 10,
      knockback: { x: 100, y: -30 },
      hitstun: 9,
      hitboxes: activeEveryTick(3, reachBox(110)),
    },
    heavy: {
      startup: 18,
      active: 4,
      recovery: 26,
      damage: 15,
      staminaDamage: 18,
      knockback: { x: 200, y: -70 },
      hitstun: 16,
      hitboxes: activeEveryTick(4, reachBox(110)),
    },
  },
};

export function getWeapon(id: WeaponId): WeaponDef {
  return WEAPONS[id];
}

export function getAttack(weapon: WeaponDef, kind: AttackKind): AttackDef {
  return kind === "light" ? weapon.light : weapon.heavy;
}

/** Mirrors a facing-relative hitbox box into world space at `origin`. */
export function hitboxWorldBox(origin: Vec, facing: 1 | -1, box: AABB): AABB {
  const x = facing === 1 ? origin.x + box.x : origin.x - box.x - box.w;
  return { x, y: origin.y + box.y, w: box.w, h: box.h };
}
