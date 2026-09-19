import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hashSeed, mulberry32 } from "../math/rng.js";
import { POWER_UP_POOL } from "./defs.js";
import { generateOffers } from "./offers.js";
import type { PowerUpDef, PowerUpId } from "./types.js";

describe("generateOffers", () => {
  it("the same seed gives the same offers", () => {
    const seed = hashSeed("match-1", 2, "player-a");
    const a = generateOffers(mulberry32(seed), {}, 1);
    const b = generateOffers(mulberry32(seed), {}, 1);
    expect(a).toEqual(b);
  });

  it("returns three unique ids from the real pool", () => {
    const rng = mulberry32(hashSeed("match-1", 1, "player-b"));
    const offers = generateOffers(rng, {}, 1);
    expect(offers).toHaveLength(3);
    expect(new Set(offers).size).toBe(3);
    for (const id of offers) {
      expect(POWER_UP_POOL.some((def) => def.id === id)).toBe(true);
    }
  });

  it("never offers a power-up already at maxStacks", () => {
    const guardianCharm = POWER_UP_POOL.find((d) => d.id === "guardianCharm")!.id;
    const ownedStacks: Partial<Record<PowerUpId, number>> = { [guardianCharm]: 2 }; // maxStacks: 2

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (seed) => {
        const offers = generateOffers(mulberry32(seed), ownedStacks, 1);
        expect(offers).not.toContain(guardianCharm);
      }),
      { seed: Number(__FC_SEED__) || undefined, numRuns: 200 },
    );
  });

  it("falls back to common stat boosts when the pool is nearly exhausted", () => {
    const common: PowerUpDef = {
      id: "onlyCommon" as PowerUpId,
      rarity: "common",
      tags: [],
      maxStacks: 5,
      modifiers: [{ stat: "moveSpeed", op: "add", value: 10 }],
    };
    const epic: PowerUpDef = {
      id: "onlyEpic" as PowerUpId,
      rarity: "epic",
      tags: [],
      maxStacks: 1,
      modifiers: [],
      effects: [{ kind: "doubleJump" }],
    };
    const tinyPool = [common, epic];
    // epic already maxed -> only `common` is eligible under the normal
    // "not maxed" filter, which is fewer than 3: the exhaustion fallback
    // must still return exactly 3 ids, all commons in this pool.
    const offers = generateOffers(mulberry32(42), { [epic.id]: 1 }, 1, tinyPool);
    expect(offers).toHaveLength(3);
    expect(offers.every((id) => id === common.id)).toBe(true);
  });

  it("a 10k-sample rarity distribution stays within tolerance of the configured weights", () => {
    const rng = mulberry32(999);
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0 };
    const byId = new Map(POWER_UP_POOL.map((d) => [d.id, d.rarity]));
    const samples = 10_000;

    for (let i = 0; i < samples; i++) {
      const offers = generateOffers(rng, {}, 1);
      for (const id of offers) {
        counts[byId.get(id)!]! += 1;
      }
    }

    const total = samples * 3;
    // Placement 1 (no catch-up boost): category weights are common:70,
    // rare:22, epic:8 out of 100 -> expected proportions 0.70/0.22/0.08,
    // split evenly across each category's own defs. Generous tolerance
    // since this is a stochastic sample, not an exact check.
    expect(counts.common! / total).toBeGreaterThan(0.6);
    expect(counts.rare! / total).toBeGreaterThan(0.14);
    expect(counts.rare! / total).toBeLessThan(0.3);
    expect(counts.epic! / total).toBeGreaterThan(0.02);
    expect(counts.epic! / total).toBeLessThan(0.14);
  });

  it("boosts non-common rarity weight for a worse placement (catch-up)", () => {
    const byId = new Map(POWER_UP_POOL.map((d) => [d.id, d.rarity]));
    const samples = 5_000;

    function nonCommonShare(placement: number): number {
      const rng = mulberry32(1234);
      let nonCommon = 0;
      for (let i = 0; i < samples; i++) {
        const offers = generateOffers(rng, {}, placement);
        for (const id of offers) {
          if (byId.get(id) !== "common") {
            nonCommon += 1;
          }
        }
      }
      return nonCommon / (samples * 3);
    }

    expect(nonCommonShare(3)).toBeGreaterThan(nonCommonShare(1));
  });
});
