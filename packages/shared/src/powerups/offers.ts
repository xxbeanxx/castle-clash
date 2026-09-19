import type { Rng } from "../math/rng.js";
import { POWER_UP_POOL } from "./defs.js";
import type { PowerUpDef, PowerUpId, Rarity } from "./types.js";

const RARITY_BASE_WEIGHT: Readonly<Record<Rarity, number>> = {
  common: 70,
  rare: 22,
  epic: 8,
};

/** Each step of `placement` beyond first (the round's winner) multiplies a
 *  non-common rarity's weight by this factor — "boosts rarity for players
 *  who lost the round" (plan step 3), configurable in one place. `placement`
 *  is 1-based (`1` = won the round), so the round's winner sees the base
 *  weights unchanged. */
const CATCH_UP_STEP_MULTIPLIER = 1.5;

/** `rarityCounts` divides a rarity's total weight evenly across however many
 *  defs of that rarity exist in the candidate pool, so — say — 12 commons
 *  and 2 rares still split the offer roughly 70/22 by *category*, not
 *  93/5 the way one weight-per-def would (a def-heavy tier would otherwise
 *  silently dominate offers just by having more entries authored in it). */
function rarityWeight(rarity: Rarity, placement: number, rarityCounts: Readonly<Record<Rarity, number>>): number {
  const base = RARITY_BASE_WEIGHT[rarity];
  const count = Math.max(1, rarityCounts[rarity]);
  const boosted = rarity === "common" ? base : base * CATCH_UP_STEP_MULTIPLIER ** Math.max(0, placement - 1);
  return boosted / count;
}

function countByRarity(defs: readonly PowerUpDef[]): Record<Rarity, number> {
  const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0 };
  for (const def of defs) {
    counts[def.rarity] += 1;
  }
  return counts;
}

function dedupeById(defs: readonly PowerUpDef[]): PowerUpDef[] {
  const seen = new Set<PowerUpId>();
  const result: PowerUpDef[] = [];
  for (const def of defs) {
    if (seen.has(def.id)) {
      continue;
    }
    seen.add(def.id);
    result.push(def);
  }
  return result;
}

function weightedPickIndex(
  rng: Rng,
  items: readonly PowerUpDef[],
  placement: number,
  rarityCounts: Readonly<Record<Rarity, number>>,
): number {
  const weights = items.map((def) => rarityWeight(def.rarity, placement, rarityCounts));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return Math.min(items.length - 1, Math.floor(rng() * items.length));
  }
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) {
      return i;
    }
  }
  return items.length - 1;
}

/**
 * Draws 3 unique power-up offers (plan step 3), weighted by rarity (boosted
 * for a worse `placement`) and excluding anything already at `maxStacks`.
 * Deterministic given `rng` — `DraftService` seeds it with
 * `hashSeed(matchSeed, round, playerId)`, so the same match/round/player
 * always sees the same offer if replayed, and two different players in the
 * same round never see each other's draw.
 *
 * Pool exhaustion (fewer than 3 non-maxed power-ups remain — a player who
 * has stacked most of the pool) falls back to including common-rarity power-
 * ups even past their own `maxStacks`, so an offer is always legal; the
 * absolute-last-resort branch (a `pool` smaller than 3 defs total — never
 * true for `POWER_UP_POOL` itself, only reachable with a tiny test pool)
 * repeats the last pick rather than return fewer than 3 ids.
 */
export function generateOffers(
  rng: Rng,
  ownedStacks: Readonly<Partial<Record<PowerUpId, number>>>,
  placement: number,
  pool: readonly PowerUpDef[] = POWER_UP_POOL,
): [PowerUpId, PowerUpId, PowerUpId] {
  const notMaxed = pool.filter((def) => (ownedStacks[def.id] ?? 0) < def.maxStacks);
  const candidatePool =
    notMaxed.length >= 3
      ? notMaxed
      : dedupeById([...notMaxed, ...pool.filter((def) => def.rarity === "common")]);

  const rarityCounts = countByRarity(candidatePool);
  const remaining = [...candidatePool];
  const picked: PowerUpDef[] = [];
  while (picked.length < 3 && remaining.length > 0) {
    const index = weightedPickIndex(rng, remaining, placement, rarityCounts);
    picked.push(remaining[index]!);
    remaining.splice(index, 1);
  }
  while (picked.length < 3) {
    picked.push(picked[picked.length - 1] ?? pool[0]!);
  }

  return [picked[0]!.id, picked[1]!.id, picked[2]!.id];
}
