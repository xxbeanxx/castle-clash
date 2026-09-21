import {
  POWER_UP_POOL,
  type EffectDef,
  type PowerUpDef,
  type Rarity,
  type StatKey,
} from "@castle-clash/shared";

/**
 * Player-facing text and icons for the power-up pool. The shared definitions carry only numbers, so
 * the names live here, and the description is *generated* from each power-up's modifiers and effects:
 * when a value is retuned in `packages/shared/src/powerups/defs.ts` the card changes with it, and a
 * new stat or effect kind is a compile error here until it is worded.
 */

/** Display names keyed by id. A power-up missing here still shows (see `powerUpName`), but
 *  `powerups.test.ts` fails, so a new one is named before it ships. */
const NAMES: Readonly<Record<string, string>> = {
  swiftBoots: "Swift Boots",
  highJump: "High Jump",
  stoneSkin: "Stone Skin",
  ironLungs: "Iron Lungs",
  secondWind: "Second Wind",
  sharpEdge: "Sharp Edge",
  bruteForce: "Brute Force",
  longReach: "Long Reach",
  quickHands: "Quick Hands",
  berserkersRage: "Berserker's Rage",
  steadyGuard: "Steady Guard",
  bracedStance: "Braced Stance",
  evasiveRoll: "Evasive Roll",
  vampiricEdge: "Vampiric Edge",
  spikedArmor: "Spiked Armor",
  aerialistBoots: "Aerialist Boots",
  emberWard: "Ember Ward",
  guardianCharm: "Guardian Charm",
};

/** The order of the tiles in `public/assets/ui/powerups.png`. MUST match `ICONS` in
 *  `art/ui/build_icons.py` (`powerups.test.ts` reads both). */
export const POWERUP_ICON_ORDER: readonly string[] = [
  "swiftBoots",
  "highJump",
  "aerialistBoots",
  "stoneSkin",
  "ironLungs",
  "secondWind",
  "sharpEdge",
  "bruteForce",
  "longReach",
  "quickHands",
  "berserkersRage",
  "vampiricEdge",
  "steadyGuard",
  "bracedStance",
  "evasiveRoll",
  "spikedArmor",
  "emberWard",
  "guardianCharm",
];

/** Tiles per row in the sheet, and the tile size in art pixels. */
export const POWERUP_ICON_COLUMNS = 6;
export const POWERUP_ICON_TILE = 16;

/** `camelCase` id as words, for a power-up nobody has named yet. */
function wordsOf(id: string): string {
  const spaced = id.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function powerUpName(id: string): string {
  return NAMES[id] ?? wordsOf(id);
}

/** `{column, row}` of the icon's tile in the sheet, or `undefined` for an id without an icon. */
export function powerUpIconTile(id: string): { column: number; row: number } | undefined {
  const index = POWERUP_ICON_ORDER.indexOf(id);
  return index < 0
    ? undefined
    : { column: index % POWERUP_ICON_COLUMNS, row: Math.floor(index / POWERUP_ICON_COLUMNS) };
}

interface StatWording {
  label: string;
  /** Words the whole line when "<amount> <label>" reads badly (a unit that must agree with the number). */
  phrase?: (amount: number) => string;
  /** `percent` values are fractions (`0.05` is 5%); `flat` ones are shown as they are. */
  unit: "flat" | "percent";
}

/** Keyed by `StatKey`, so a new stat is a compile error here until it is worded. */
const STATS: Readonly<Record<StatKey, StatWording>> = {
  moveSpeed: { label: "move speed", unit: "flat" },
  jumpVelocity: { label: "jump strength", unit: "flat" },
  maxHp: { label: "max HP", unit: "flat" },
  staminaMax: { label: "max stamina", unit: "flat" },
  staminaRegen: { label: "stamina regained per tick", unit: "flat" },
  lightDamage: { label: "light attack damage", unit: "flat" },
  heavyDamage: { label: "heavy attack damage", unit: "flat" },
  reach: { label: "reach", unit: "flat" },
  attackSpeed: { label: "attack speed", unit: "percent" },
  dodgeIFrames: {
    label: "roll invulnerability",
    unit: "flat",
    phrase: (amount) =>
      `${signed(amount)} ${Math.abs(amount) === 1 ? "tick" : "ticks"} of roll invulnerability`,
  },
  blockStaminaCost: { label: "block stamina cost", unit: "percent" },
  knockbackResist: { label: "knockback resistance", unit: "percent" },
};

function signed(value: number): string {
  const text = String(Math.round(value * 1000) / 1000);
  return value > 0 ? `+${text}` : text;
}

function percent(fraction: number): string {
  return `${signed(Math.round(fraction * 100))}%`;
}

function describeEffect(effect: EffectDef): string {
  switch (effect.kind) {
    case "lifesteal":
      return `Heal ${Math.round(effect.pct * 100)}% of the damage you deal`;
    case "thorns":
      return `Reflect ${Math.round(effect.pct * 100)}% of the damage you take`;
    case "doubleJump":
      return "Jump once more in mid-air";
    case "fireImmune":
      return "Immune to fire";
    case "ringOutArmor":
      return effect.charges === 1
        ? "Survive one fall into a kill zone"
        : `Survive ${effect.charges} falls into a kill zone`;
  }
}

/** One line per modifier and effect, e.g. `["+16 move speed"]`. */
export function describePowerUp(def: PowerUpDef): string[] {
  const lines = def.modifiers.map((modifier) => {
    const stat = STATS[modifier.stat];
    if (stat.phrase) {
      return stat.phrase(modifier.value);
    }
    const amount = stat.unit === "percent" ? percent(modifier.value) : signed(modifier.value);
    return `${amount} ${stat.label}`;
  });
  for (const effect of def.effects ?? []) {
    lines.push(describeEffect(effect));
  }
  return lines;
}

export interface PowerUpCard {
  id: string;
  name: string;
  rarity: Rarity | null;
  lines: string[];
  /** "Stacks up to x5", or that it can be had once. Empty for an unknown id. */
  stacks: string;
}

/** Everything a card shows. An id missing from the pool still gets a name so the UI never blanks. */
export function powerUpCard(id: string): PowerUpCard {
  const def = POWER_UP_POOL.find((entry) => entry.id === id);
  return {
    id,
    name: powerUpName(id),
    rarity: def?.rarity ?? null,
    lines: def ? describePowerUp(def) : [],
    stacks: def ? (def.maxStacks > 1 ? `Stacks up to ×${def.maxStacks}` : "One per match") : "",
  };
}
