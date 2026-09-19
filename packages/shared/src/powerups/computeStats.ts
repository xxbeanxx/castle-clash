import { activeEveryTick, type AttackDef, type WeaponDef } from "../combat/weapons.js";
import {
  DODGE_IFRAME_TICKS,
  JUMP_VELOCITY,
  MAX_HP,
  MAX_RUN_SPEED,
  MAX_STAMINA,
  STAMINA_REGEN_PER_TICK,
} from "../config/game.js";
import { getPowerUp } from "./defs.js";
import type { DerivedStats, PowerUpId, StatKey } from "./types.js";

/** The non-weapon-dependent stats' base values — `moveSpeed`/`jumpVelocity`/
 *  `maxHp`/`staminaMax`/`staminaRegenPerTick`/`dodgeIFrames` come from here;
 *  `lightDamage`/`heavyDamage`/`reach` come from the `WeaponDef` passed to
 *  `computeStats` instead, since those are weapon-specific. */
export interface BaseStats {
  moveSpeed: number;
  jumpVelocity: number;
  maxHp: number;
  staminaMax: number;
  staminaRegenPerTick: number;
  dodgeIFrames: number;
}

export const BASE_STATS: BaseStats = {
  moveSpeed: MAX_RUN_SPEED,
  jumpVelocity: JUMP_VELOCITY,
  maxHp: MAX_HP,
  staminaMax: MAX_STAMINA,
  staminaRegenPerTick: STAMINA_REGEN_PER_TICK,
  dodgeIFrames: DODGE_IFRAME_TICKS,
};

/** `[min, max]` per stat, applied after every modifier (plan: "clamps" is
 *  the final stage). `attackSpeed`/`blockStaminaCost` are multipliers around
 *  a base of `1`; `knockbackResist` is a fraction capped well below `1` so a
 *  hit can never be reduced to nothing. */
const CLAMPS: Record<StatKey, readonly [number, number]> = {
  moveSpeed: [0, Infinity],
  jumpVelocity: [0, Infinity],
  maxHp: [1, Infinity],
  staminaMax: [1, Infinity],
  staminaRegen: [0, Infinity],
  lightDamage: [0, Infinity],
  heavyDamage: [0, Infinity],
  reach: [10, Infinity],
  attackSpeed: [0.4, 3],
  dodgeIFrames: [0, Infinity],
  blockStaminaCost: [0.1, 2],
  knockbackResist: [0, 0.9],
};

function clampStat(stat: StatKey, value: number): number {
  const [min, max] = CLAMPS[stat];
  return Math.min(max, Math.max(min, value));
}

function baseValue(stat: StatKey, base: BaseStats, weapon: WeaponDef): number {
  switch (stat) {
    case "moveSpeed":
      return base.moveSpeed;
    case "jumpVelocity":
      return base.jumpVelocity;
    case "maxHp":
      return base.maxHp;
    case "staminaMax":
      return base.staminaMax;
    case "staminaRegen":
      return base.staminaRegenPerTick;
    case "dodgeIFrames":
      return base.dodgeIFrames;
    case "lightDamage":
      return weapon.light.damage;
    case "heavyDamage":
      return weapon.heavy.damage;
    case "reach":
      return weapon.reach;
    case "attackSpeed":
      return 1;
    case "blockStaminaCost":
      return 1;
    case "knockbackResist":
      return 0;
  }
}

interface ModifierTotals {
  add: number;
  mul: number;
}

/** Folds every owned power-up's modifiers into one `{add, mul}` total per
 *  stat — each stack applies its modifier's `value` once (plan: stacks are
 *  additive repeats of the same modifier, not compounding). */
function aggregateModifiers(
  stacks: Readonly<Partial<Record<PowerUpId, number>>>,
): Map<StatKey, ModifierTotals> {
  const totals = new Map<StatKey, ModifierTotals>();
  for (const [id, count] of Object.entries(stacks) as [PowerUpId, number | undefined][]) {
    if (!count || count <= 0) {
      continue;
    }
    const def = getPowerUp(id);
    if (!def) {
      continue;
    }
    for (const modifier of def.modifiers) {
      const entry = totals.get(modifier.stat) ?? { add: 0, mul: 0 };
      if (modifier.op === "add") {
        entry.add += modifier.value * count;
      } else {
        entry.mul += modifier.value * count;
      }
      totals.set(modifier.stat, entry);
    }
  }
  return totals;
}

function aggregateEffects(
  stacks: Readonly<Partial<Record<PowerUpId, number>>>,
): DerivedStats["effects"] {
  let lifestealPct = 0;
  let thornsPct = 0;
  let doubleJump = false;
  let fireImmune = false;
  let ringOutArmorCharges = 0;

  for (const [id, count] of Object.entries(stacks) as [PowerUpId, number | undefined][]) {
    if (!count || count <= 0) {
      continue;
    }
    const def = getPowerUp(id);
    if (!def?.effects) {
      continue;
    }
    for (const effect of def.effects) {
      switch (effect.kind) {
        case "lifesteal":
          lifestealPct += effect.pct * count;
          break;
        case "thorns":
          thornsPct += effect.pct * count;
          break;
        case "doubleJump":
          doubleJump = true;
          break;
        case "fireImmune":
          fireImmune = true;
          break;
        case "ringOutArmor":
          ringOutArmorCharges += effect.charges * count;
          break;
      }
    }
  }

  return {
    lifestealPct: Math.min(1, lifestealPct),
    thornsPct: Math.min(1, thornsPct),
    doubleJump,
    fireImmune,
    ringOutArmorCharges,
  };
}

/**
 * Folds a player's owned power-up stacks into `DerivedStats` (plan step 2):
 * for every stat, additive modifiers apply first (`base + sum(value *
 * stacks)`), then multiplicative ones combine into one bonus applied once
 * (`* (1 + sum(value * stacks))`), then the result is clamped. Zero stacks
 * reproduces `base`/`weapon`'s own numbers exactly — `sim/GameSimulation.ts`
 * calls this every tick for every player regardless of whether they own any
 * power-ups, so this identity matters for every pre-Phase-7 test to keep
 * passing unmodified.
 */
export function computeStats(
  base: BaseStats,
  weapon: WeaponDef,
  stacks: Readonly<Partial<Record<PowerUpId, number>>>,
): DerivedStats {
  const totals = aggregateModifiers(stacks);
  const stat = (key: StatKey): number => {
    const { add, mul } = totals.get(key) ?? { add: 0, mul: 0 };
    return clampStat(key, (baseValue(key, base, weapon) + add) * (1 + mul));
  };

  return {
    moveSpeed: stat("moveSpeed"),
    jumpVelocity: stat("jumpVelocity"),
    maxHp: stat("maxHp"),
    staminaMax: stat("staminaMax"),
    staminaRegenPerTick: stat("staminaRegen"),
    lightDamage: stat("lightDamage"),
    heavyDamage: stat("heavyDamage"),
    reach: stat("reach"),
    attackSpeed: stat("attackSpeed"),
    dodgeIFrames: stat("dodgeIFrames"),
    blockStaminaCostMultiplier: stat("blockStaminaCost"),
    knockbackResistFraction: stat("knockbackResist"),
    effects: aggregateEffects(stacks),
  };
}

function scaleTicks(value: number, attackSpeed: number): number {
  return Math.max(1, Math.round(value / attackSpeed));
}

function scaleAttack(attack: AttackDef, damage: number, attackSpeed: number, reachScale: number): AttackDef {
  const active = scaleTicks(attack.active, attackSpeed);
  const template = attack.hitboxes[0]?.box;
  const hitboxes = template
    ? activeEveryTick(active, { ...template, w: template.w * reachScale })
    : attack.hitboxes;

  return {
    ...attack,
    startup: scaleTicks(attack.startup, attackSpeed),
    active,
    recovery: scaleTicks(attack.recovery, attackSpeed),
    damage,
    hitboxes,
  };
}

/**
 * Produces the per-player effective `WeaponDef` `DerivedStats.attackSpeed`/
 * `reach`/`lightDamage`/`heavyDamage` imply (plan step 2: "attack frame data
 * scales by attackSpeed, rounded and never below 1 tick") — `sim/
 * GameSimulation.ts` calls this once per player per tick and passes the
 * result to `combat/fsm.ts`/`combat/resolve.ts`/`hazards/step.ts` in place of
 * the raw `WEAPONS` table entry, so those modules never need to know
 * power-ups exist. At base stats (no power-ups owned) this reproduces the
 * original `WeaponDef` value-for-value.
 */
export function deriveWeapon(weapon: WeaponDef, stats: DerivedStats): WeaponDef {
  const reachScale = stats.reach / weapon.reach;
  return {
    ...weapon,
    reach: stats.reach,
    light: scaleAttack(weapon.light, stats.lightDamage, stats.attackSpeed, reachScale),
    heavy: scaleAttack(weapon.heavy, stats.heavyDamage, stats.attackSpeed, reachScale),
    airLight: scaleAttack(weapon.airLight, stats.lightDamage, stats.attackSpeed, reachScale),
  };
}
