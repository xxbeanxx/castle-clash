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
  /** An airborne light attack's own frame data (plan Phase 4 step 1's
   *  cancel-rules bullet) — derived from `light` by `deriveAirLight`, not
   *  hand-authored per weapon: shorter recovery (you're already committed
   *  to falling, less landing lag) and a downward-angled hitbox/knockback
   *  (striking down at an airborne target from above). Only light attacks
   *  get an aerial variant; an airborne heavy reuses the grounded `heavy`. */
  airLight: AttackDef;
  /** How many lights can chain back-to-back from AttackRecovery before it
   *  must return to a neutral state (the Sword's "light chains x2" trait). */
  lightChainLimit: number;
}

/** One hitbox per active tick, all sharing the same facing-relative box —
 *  frame data doesn't need a swept/growing hitbox for Phase 4's MVP weapons.
 *  Exported for `powerups/computeStats.ts`'s `deriveWeapon`, which
 *  regenerates a scaled-reach/scaled-active-window hitbox list the same way
 *  `deriveAirLight` below does. */
export function activeEveryTick(active: number, box: AABB): AttackHitbox[] {
  return Array.from({ length: active }, (_, tickOffset) => ({ tickOffset, box }));
}

/** The swing box for a weapon of `reach`, facing right (`facing === 1`):
 *  starts at the player's leading edge and extends `reach` further, full
 *  player height. `yOffset` angles it up/down (used by `deriveAirLight`). */
function reachBox(reach: number, yOffset = 0): AABB {
  return { x: PLAYER_WIDTH, y: yOffset, w: reach, h: PLAYER_HEIGHT };
}

const AIR_LIGHT_RECOVERY_FRACTION = 0.6;
const AIR_LIGHT_HITBOX_Y_OFFSET = 10;

function deriveAirLight(light: AttackDef, reach: number): AttackDef {
  const recovery = Math.max(1, Math.round(light.recovery * AIR_LIGHT_RECOVERY_FRACTION));
  return {
    ...light,
    recovery,
    knockback: { x: light.knockback.x, y: Math.abs(light.knockback.y) },
    hitboxes: activeEveryTick(light.active, reachBox(reach, AIR_LIGHT_HITBOX_Y_OFFSET)),
  };
}

type GroundedWeaponDef = Omit<WeaponDef, "airLight">;

const GROUNDED_WEAPONS: Readonly<Record<WeaponId, GroundedWeaponDef>> = {
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

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = Object.fromEntries(
  Object.entries(GROUNDED_WEAPONS).map(([id, weapon]) => [
    id,
    { ...weapon, airLight: deriveAirLight(weapon.light, weapon.reach) },
  ]),
) as Record<WeaponId, WeaponDef>;

export function getWeapon(id: WeaponId): WeaponDef {
  return WEAPONS[id];
}

export function getAttack(weapon: WeaponDef, kind: AttackKind): AttackDef {
  if (kind === "light") {
    return weapon.light;
  }
  if (kind === "airLight") {
    return weapon.airLight;
  }
  return weapon.heavy;
}

/** Mirrors a facing-relative hitbox box into world space at `origin`. */
export function hitboxWorldBox(origin: Vec, facing: 1 | -1, box: AABB): AABB {
  const x = facing === 1 ? origin.x + box.x : origin.x - box.x - box.w;
  return { x, y: origin.y + box.y, w: box.w, h: box.h };
}
