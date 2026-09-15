import { describe, expect, it } from "vitest";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import { encode } from "../input/bitmask.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimState } from "../sim/types.js";
import { playerId, WEAPON_IDS, type WeaponId } from "../types/ids.js";
import { WEAPONS } from "./weapons.js";

const A = playerId("a");
const B = playerId("b");
const LIGHT = encode(["LIGHT"]);
const MAX_DUEL_TICKS = 6000;

/**
 * Bots that hold LIGHT the whole duel, standing just inside both weapons'
 * reach — no movement, no blocking, no dodging. Deterministic (no RNG), so
 * each matchup produces one exact tick count, not a distribution; the bands
 * below are that empirical value with slop, the balance-regression guard
 * the plan's `ttk.test.ts` asks for. A deliberate tuning change to
 * `combat/weapons.ts` updates these bands together.
 */
function duelTicks(weaponA: WeaponId, weaponB: WeaponId): number {
  const reach = Math.min(WEAPONS[weaponA].reach, WEAPONS[weaponB].reach);
  const distance = 28 + reach - 5;
  let state: SimState = {
    tick: 0,
    players: {
      [A]: { ...createSimPlayer({ x: 0, y: 600 }, weaponA), grounded: true, facing: 1 },
      [B]: { ...createSimPlayer({ x: distance, y: 600 }, weaponB), grounded: true, facing: -1 },
    },
    arena: TESTBED_ARENA,
    rngSeed: 1,
  };

  for (let i = 1; i <= MAX_DUEL_TICKS; i++) {
    state = step(state, {
      [A]: { seq: i, bits: LIGHT },
      [B]: { seq: i, bits: LIGHT },
    }).state;
    if (state.players[A]!.action === "Dead" || state.players[B]!.action === "Dead") {
      return i;
    }
  }
  throw new Error(`duel between ${weaponA} and ${weaponB} did not end within ${MAX_DUEL_TICKS} ticks`);
}

// Bands are each matchup's measured tick count (both bots stand just inside
// reach and spam LIGHT the whole duel) with ~30% slop either way — the
// balance-regression guard the plan's `ttk.test.ts` asks for, re-centered
// whenever `combat/weapons.ts`'s frame data is deliberately retuned.
const MATCHUPS: readonly [WeaponId, WeaponId, number, number][] = [
  [WEAPON_IDS.SWORD, WEAPON_IDS.SWORD, 89, 165],
  [WEAPON_IDS.SWORD, WEAPON_IDS.MACE, 50, 94],
  [WEAPON_IDS.SWORD, WEAPON_IDS.SPEAR, 120, 222],
  [WEAPON_IDS.MACE, WEAPON_IDS.MACE, 95, 177],
  [WEAPON_IDS.MACE, WEAPON_IDS.SPEAR, 111, 207],
  [WEAPON_IDS.SPEAR, WEAPON_IDS.SPEAR, 169, 313],
];

describe("combat/ttk balance regression guard", () => {
  it.each(MATCHUPS)("%s vs %s stays within its designed TTK band", (weaponA, weaponB, min, max) => {
    const ticks = duelTicks(weaponA, weaponB);
    expect(ticks).toBeGreaterThanOrEqual(min);
    expect(ticks).toBeLessThanOrEqual(max);
  });
});
