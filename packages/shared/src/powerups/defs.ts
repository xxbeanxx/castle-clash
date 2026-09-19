import { powerUpId, type PowerUpDef, type PowerUpId } from "./types.js";

/**
 * The full power-up pool (plan step 1's closed effect list plus a spread of
 * single-modifier stat boosts to give offer generation something to weight
 * by rarity). Every consumer that needs a `PowerUpDef` by id goes through
 * this registry — `computeStats.ts` to fold owned stacks into `DerivedStats`,
 * `offers.ts` (via its own `pool` parameter, which defaults to
 * `POWER_UP_POOL`) to draw seeded offers — the same one-registry precedent
 * `arenas/registry.ts` set in Phase 6.
 */
export const POWER_UP_POOL: readonly PowerUpDef[] = [
  {
    id: powerUpId("swiftBoots"),
    rarity: "common",
    tags: ["mobility"],
    maxStacks: 5,
    modifiers: [{ stat: "moveSpeed", op: "add", value: 16 }],
  },
  {
    id: powerUpId("highJump"),
    rarity: "common",
    tags: ["mobility"],
    maxStacks: 5,
    modifiers: [{ stat: "jumpVelocity", op: "add", value: 40 }],
  },
  {
    id: powerUpId("stoneSkin"),
    rarity: "common",
    tags: ["defense", "sustain"],
    maxStacks: 5,
    modifiers: [{ stat: "maxHp", op: "add", value: 12 }],
  },
  {
    id: powerUpId("ironLungs"),
    rarity: "common",
    tags: ["sustain"],
    maxStacks: 5,
    modifiers: [{ stat: "staminaMax", op: "add", value: 12 }],
  },
  {
    id: powerUpId("secondWind"),
    rarity: "common",
    tags: ["sustain"],
    maxStacks: 5,
    modifiers: [{ stat: "staminaRegen", op: "add", value: 0.2 }],
  },
  {
    id: powerUpId("sharpEdge"),
    rarity: "common",
    tags: ["offense"],
    maxStacks: 5,
    modifiers: [{ stat: "lightDamage", op: "add", value: 2 }],
  },
  {
    id: powerUpId("bruteForce"),
    rarity: "common",
    tags: ["offense"],
    maxStacks: 5,
    modifiers: [{ stat: "heavyDamage", op: "add", value: 4 }],
  },
  {
    id: powerUpId("longReach"),
    rarity: "common",
    tags: ["offense"],
    maxStacks: 5,
    modifiers: [{ stat: "reach", op: "add", value: 8 }],
  },
  {
    id: powerUpId("quickHands"),
    rarity: "common",
    tags: ["offense"],
    maxStacks: 5,
    modifiers: [{ stat: "attackSpeed", op: "mul", value: 0.06 }],
  },
  {
    id: powerUpId("berserkersRage"),
    rarity: "common",
    tags: ["offense"],
    maxStacks: 5,
    modifiers: [{ stat: "attackSpeed", op: "add", value: 0.15 }],
  },
  {
    id: powerUpId("steadyGuard"),
    rarity: "common",
    tags: ["defense"],
    maxStacks: 5,
    modifiers: [{ stat: "blockStaminaCost", op: "mul", value: -0.1 }],
  },
  {
    id: powerUpId("bracedStance"),
    rarity: "common",
    tags: ["defense"],
    maxStacks: 5,
    modifiers: [{ stat: "knockbackResist", op: "add", value: 0.05 }],
  },
  {
    id: powerUpId("evasiveRoll"),
    rarity: "common",
    tags: ["defense", "mobility"],
    maxStacks: 5,
    modifiers: [{ stat: "dodgeIFrames", op: "add", value: 1 }],
  },
  {
    id: powerUpId("vampiricEdge"),
    rarity: "rare",
    tags: ["offense", "sustain"],
    maxStacks: 3,
    modifiers: [],
    effects: [{ kind: "lifesteal", pct: 0.1 }],
  },
  {
    id: powerUpId("spikedArmor"),
    rarity: "rare",
    tags: ["defense"],
    maxStacks: 3,
    modifiers: [],
    effects: [{ kind: "thorns", pct: 0.12 }],
  },
  {
    id: powerUpId("aerialistBoots"),
    rarity: "epic",
    tags: ["mobility"],
    maxStacks: 1,
    modifiers: [],
    effects: [{ kind: "doubleJump" }],
  },
  {
    id: powerUpId("emberWard"),
    rarity: "epic",
    tags: ["defense"],
    maxStacks: 1,
    modifiers: [],
    effects: [{ kind: "fireImmune" }],
  },
  {
    id: powerUpId("guardianCharm"),
    rarity: "epic",
    tags: ["defense", "sustain"],
    maxStacks: 2,
    modifiers: [],
    effects: [{ kind: "ringOutArmor", charges: 1 }],
  },
];

const POWER_UPS_BY_ID: ReadonlyMap<PowerUpId, PowerUpDef> = new Map(
  POWER_UP_POOL.map((def) => [def.id, def]),
);

export function getPowerUp(id: PowerUpId): PowerUpDef | undefined {
  return POWER_UPS_BY_ID.get(id);
}

export function isPowerUpId(value: string): value is PowerUpId {
  return POWER_UPS_BY_ID.has(powerUpId(value));
}
