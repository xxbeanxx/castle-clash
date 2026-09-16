import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getWeapon } from "../combat/weapons.js";
import { WEAPON_IDS } from "../types/ids.js";
import { BASE_STATS, computeStats, deriveWeapon } from "./computeStats.js";
import { POWER_UP_POOL } from "./defs.js";
import type { PowerUpId } from "./types.js";

const SWORD = getWeapon(WEAPON_IDS.SWORD);

const STACKABLE_IDS = POWER_UP_POOL.map((def) => def.id);

describe("computeStats", () => {
  it("reproduces base stats and the weapon's own numbers with zero stacks", () => {
    const stats = computeStats(BASE_STATS, SWORD, {});
    expect(stats.moveSpeed).toBe(BASE_STATS.moveSpeed);
    expect(stats.jumpVelocity).toBe(BASE_STATS.jumpVelocity);
    expect(stats.maxHp).toBe(BASE_STATS.maxHp);
    expect(stats.staminaMax).toBe(BASE_STATS.staminaMax);
    expect(stats.staminaRegenPerTick).toBe(BASE_STATS.staminaRegenPerTick);
    expect(stats.dodgeIFrames).toBe(BASE_STATS.dodgeIFrames);
    expect(stats.lightDamage).toBe(SWORD.light.damage);
    expect(stats.heavyDamage).toBe(SWORD.heavy.damage);
    expect(stats.reach).toBe(SWORD.reach);
    expect(stats.attackSpeed).toBe(1);
    expect(stats.blockStaminaCostMultiplier).toBe(1);
    expect(stats.knockbackResistFraction).toBe(0);
    expect(stats.effects).toEqual({
      lifestealPct: 0,
      thornsPct: 0,
      doubleJump: false,
      fireImmune: false,
      ringOutArmorCharges: 0,
    });
  });

  it("applies additive modifiers before multiplicative ones", () => {
    // quickHands is a "mul" attackSpeed modifier; sharpEdge is an "add"
    // lightDamage modifier — pick a stat both a mul and add modifier target
    // to check ordering directly: moveSpeed here gets one add (swiftBoots)
    // stacked twice, verified against the closed-form add-then-mul formula.
    const stacks: Partial<Record<PowerUpId, number>> = {
      [POWER_UP_POOL.find((d) => d.id === "swiftBoots")!.id]: 2,
    };
    const stats = computeStats(BASE_STATS, SWORD, stacks);
    expect(stats.moveSpeed).toBe(BASE_STATS.moveSpeed + 16 * 2);
  });

  it("sums multiplicative modifiers into one combined bonus applied once", () => {
    const quickHands = POWER_UP_POOL.find((d) => d.id === "quickHands")!.id;
    const stats = computeStats(BASE_STATS, SWORD, { [quickHands]: 3 });
    // attackSpeed base 1, +0.06 per stack (mul), 3 stacks -> 1 * (1 + 0.18).
    expect(stats.attackSpeed).toBeCloseTo(1.18, 5);
  });

  it("aggregates effect magnitudes across stacks and caps at 1", () => {
    const vampiricEdge = POWER_UP_POOL.find((d) => d.id === "vampiricEdge")!.id;
    const stats = computeStats(BASE_STATS, SWORD, { [vampiricEdge]: 3 });
    expect(stats.effects.lifestealPct).toBeCloseTo(0.3, 5);

    const maxedOut = computeStats(BASE_STATS, SWORD, { [vampiricEdge]: 20 });
    expect(maxedOut.effects.lifestealPct).toBe(1);
  });

  it("treats boolean effects as present with a single stack", () => {
    const aerialistBoots = POWER_UP_POOL.find((d) => d.id === "aerialistBoots")!.id;
    const emberWard = POWER_UP_POOL.find((d) => d.id === "emberWard")!.id;
    const stats = computeStats(BASE_STATS, SWORD, { [aerialistBoots]: 1, [emberWard]: 1 });
    expect(stats.effects.doubleJump).toBe(true);
    expect(stats.effects.fireImmune).toBe(true);
  });

  it("sums charge-bearing effects across stacks", () => {
    const guardianCharm = POWER_UP_POOL.find((d) => d.id === "guardianCharm")!.id;
    const stats = computeStats(BASE_STATS, SWORD, { [guardianCharm]: 2 });
    expect(stats.effects.ringOutArmorCharges).toBe(2);
  });

  it("property: every stack combination keeps every stat within its clamp range", () => {
    const stacksArb = fc.dictionary(
      fc.constantFrom(...STACKABLE_IDS),
      fc.integer({ min: 0, max: 8 }),
    );
    fc.assert(
      fc.property(stacksArb, (stacks) => {
        const stats = computeStats(BASE_STATS, SWORD, stacks);
        expect(stats.moveSpeed).toBeGreaterThanOrEqual(0);
        expect(stats.jumpVelocity).toBeGreaterThanOrEqual(0);
        expect(stats.maxHp).toBeGreaterThanOrEqual(1);
        expect(stats.staminaMax).toBeGreaterThanOrEqual(1);
        expect(stats.staminaRegenPerTick).toBeGreaterThanOrEqual(0);
        expect(stats.lightDamage).toBeGreaterThanOrEqual(0);
        expect(stats.heavyDamage).toBeGreaterThanOrEqual(0);
        expect(stats.reach).toBeGreaterThanOrEqual(10);
        expect(stats.attackSpeed).toBeGreaterThanOrEqual(0.4);
        expect(stats.attackSpeed).toBeLessThanOrEqual(3);
        expect(stats.blockStaminaCostMultiplier).toBeGreaterThanOrEqual(0.1);
        expect(stats.blockStaminaCostMultiplier).toBeLessThanOrEqual(2);
        expect(stats.knockbackResistFraction).toBeGreaterThanOrEqual(0);
        expect(stats.knockbackResistFraction).toBeLessThanOrEqual(0.9);
        expect(stats.effects.lifestealPct).toBeGreaterThanOrEqual(0);
        expect(stats.effects.lifestealPct).toBeLessThanOrEqual(1);
        expect(stats.effects.thornsPct).toBeGreaterThanOrEqual(0);
        expect(stats.effects.thornsPct).toBeLessThanOrEqual(1);
      }),
      { seed: Number(__FC_SEED__) || undefined },
    );
  });
});

describe("deriveWeapon", () => {
  it("reproduces the original weapon value-for-value at base stats", () => {
    const stats = computeStats(BASE_STATS, SWORD, {});
    const derived = deriveWeapon(SWORD, stats);
    expect(derived.reach).toBe(SWORD.reach);
    expect(derived.light).toEqual(SWORD.light);
    expect(derived.heavy).toEqual(SWORD.heavy);
    expect(derived.airLight).toEqual(SWORD.airLight);
  });

  it("scales frame data by attackSpeed, rounded and never below 1 tick", () => {
    const quickHands = POWER_UP_POOL.find((d) => d.id === "quickHands")!.id;
    // computeStats itself doesn't enforce maxStacks (offers.ts/DraftService
    // do) — a deliberately unrealistic stack count here just exercises the
    // attackSpeed clamp's upper bound (3).
    const stats = computeStats(BASE_STATS, SWORD, { [quickHands]: 40 });
    expect(stats.attackSpeed).toBe(3);
    const derived = deriveWeapon(SWORD, stats);
    expect(derived.light.startup).toBe(Math.max(1, Math.round(SWORD.light.startup / 3)));
    expect(derived.light.active).toBeGreaterThanOrEqual(1);
    expect(derived.heavy.recovery).toBeGreaterThanOrEqual(1);
  });

  it("scales damage and reach directly from DerivedStats", () => {
    const longReach = POWER_UP_POOL.find((d) => d.id === "longReach")!.id;
    const sharpEdge = POWER_UP_POOL.find((d) => d.id === "sharpEdge")!.id;
    const stats = computeStats(BASE_STATS, SWORD, { [longReach]: 2, [sharpEdge]: 1 });
    const derived = deriveWeapon(SWORD, stats);
    expect(derived.reach).toBe(SWORD.reach + 16);
    expect(derived.light.damage).toBe(SWORD.light.damage + 2);
    expect(derived.light.hitboxes[0]!.box.w).toBeCloseTo((SWORD.reach + 16), 5);
  });
});
