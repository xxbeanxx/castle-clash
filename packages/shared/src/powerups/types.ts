declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

/** Every numeric knob a `PowerUpDef` modifier can target (plan Phase 7 step
 *  1). `computeStats.ts` is the only place these are read off `WeaponDef`/
 *  `config/game.ts` base values — everywhere else in `combat`/`sim` accepts
 *  the already-derived numbers as plain parameters, so those modules never
 *  need to import from `powerups` (the dependency runs one way: `powerups`
 *  depends on `combat`'s `WeaponDef`, not the reverse). */
export const STAT_KEYS = [
  "moveSpeed",
  "jumpVelocity",
  "maxHp",
  "staminaMax",
  "staminaRegen",
  "lightDamage",
  "heavyDamage",
  "reach",
  "attackSpeed",
  "dodgeIFrames",
  "blockStaminaCost",
  "knockbackResist",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export function isStatKey(value: string): value is StatKey {
  return (STAT_KEYS as readonly string[]).includes(value);
}

/** `"add"` sums `value * stacks` onto the base; `"mul"` sums `value * stacks`
 *  into one combined multiplier applied once, after every stat's additive
 *  stage (plan: "additive modifiers apply first, then multiplicative, then
 *  per-stat clamps" — see `computeStats.ts`). `value` for `"mul"` is a
 *  fractional bonus (`0.1` == "+10%"), not the multiplier itself. */
export interface StatModifier {
  stat: StatKey;
  op: "add" | "mul";
  value: number;
}

/**
 * A closed, serializable union (plan step 1) — every variant is implemented
 * directly in the sim (`combat/resolve.ts`, `sim/GameSimulation.ts`,
 * `hazards/step.ts`), never as an arbitrary callback, so an effect stays
 * deterministic and replayable the same way every other sim rule is.
 */
export type EffectDef =
  | { kind: "lifesteal"; pct: number }
  | { kind: "thorns"; pct: number }
  | { kind: "doubleJump" }
  | { kind: "fireImmune" }
  | { kind: "ringOutArmor"; charges: number };

export type EffectKind = EffectDef["kind"];

export type Rarity = "common" | "rare" | "epic";

export const RARITIES: readonly Rarity[] = ["common", "rare", "epic"];

export type PowerUpId = Brand<string, "PowerUpId">;

export function powerUpId(raw: string): PowerUpId {
  return raw as PowerUpId;
}

export interface PowerUpDef {
  id: PowerUpId;
  rarity: Rarity;
  /** Free-form categorization (e.g. `"offense"`, `"mobility"`) — carried for
   *  display and future offer-variety heuristics; nothing in this phase
   *  reads it to change selection odds. */
  tags: readonly string[];
  maxStacks: number;
  modifiers: readonly StatModifier[];
  effects?: readonly EffectDef[];
}

/** Player-facing stats/effects after every owned power-up's modifiers are
 *  folded together (plan step 2's `DerivedStats`) — everything downstream
 *  (`sim/GameSimulation.ts`, `combat/resolve.ts`, `hazards/step.ts`) consumes
 *  this instead of re-reading raw stacks. */
export interface DerivedStats {
  moveSpeed: number;
  jumpVelocity: number;
  maxHp: number;
  staminaMax: number;
  staminaRegenPerTick: number;
  lightDamage: number;
  heavyDamage: number;
  reach: number;
  /** Multiplier on attack frame data (startup/active/recovery); base `1`. */
  attackSpeed: number;
  dodgeIFrames: number;
  /** Multiplier applied to the stamina a *blocked* hit costs its defender;
   *  base `1`. */
  blockStaminaCostMultiplier: number;
  /** Fraction of incoming knockback removed; base `0`, clamped `[0, 0.9]`. */
  knockbackResistFraction: number;
  effects: {
    /** Fraction of damage dealt the attacker heals for; `[0, 1]`. */
    lifestealPct: number;
    /** Fraction of damage taken reflected back onto the attacker; `[0, 1]`. */
    thornsPct: number;
    doubleJump: boolean;
    fireImmune: boolean;
    ringOutArmorCharges: number;
  };
}
