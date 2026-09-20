/**
 * The knobs a bot's difficulty is made of, and nothing else: the brain's logic is identical for
 * every tier. `bots/tiers.test.ts` and `bots/brain.test.ts` measure that these actually order the
 * tiers by strength, so a retune that inverts them fails a test rather than shipping.
 *
 * `dummy` is not a difficulty: it stands still and never acts, for the tutorial's training target.
 */
export type BotTier = "easy" | "normal" | "hard";
export type BotKind = BotTier | "dummy";

export interface BotParams {
  /** Ticks (60 Hz) between something happening to the target and the bot being able to react to it. */
  readonly reactionTicks: number;
  /** Chance per tick, once in range and neutral, of starting an attack. */
  readonly attackRate: number;
  /** Share of attacks that are heavies. */
  readonly heavyShare: number;
  /** Chance per tick, in melee range with no plan, of raising its guard on a hunch. */
  readonly guardHunch: number;
  /** Chance a noticed incoming attack is answered with a block. */
  readonly blockChance: number;
  /** Chance a noticed incoming attack is answered with a dodge (rolled after block). */
  readonly dodgeChance: number;
  /** Chance a decision is simply botched: an attack answer that never happens, a swing at thin air. */
  readonly errorRate: number;
  /** Whether it presses its advantage on a target in hitstun, guard break or block. */
  readonly punishes: boolean;
}

export const BOT_TIERS: Readonly<Record<BotTier, BotParams>> = {
  easy: {
    reactionTicks: 18,
    attackRate: 0.05,
    heavyShare: 0.2,
    guardHunch: 0.01,
    blockChance: 0.3,
    dodgeChance: 0,
    errorRate: 0.3,
    punishes: false,
  },
  normal: {
    reactionTicks: 9,
    attackRate: 0.11,
    heavyShare: 0.3,
    guardHunch: 0.04,
    blockChance: 0.55,
    dodgeChance: 0.15,
    errorRate: 0.12,
    punishes: true,
  },
  hard: {
    reactionTicks: 4,
    attackRate: 0.2,
    heavyShare: 0.35,
    guardHunch: 0.01,
    blockChance: 0.6,
    dodgeChance: 0.3,
    errorRate: 0.04,
    punishes: true,
  },
};

export const BOT_TIER_IDS: readonly BotTier[] = ["easy", "normal", "hard"];

export function isBotTier(value: unknown): value is BotTier {
  return typeof value === "string" && (BOT_TIER_IDS as readonly string[]).includes(value);
}

/** Bots a match may hold: practice offers 1 to 3 (a seat is left for the human). */
export const MAX_PRACTICE_BOTS = 3;

/** Names bots take, in order; a match never reuses one while it has an unused name left. */
export const BOT_NAMES: readonly string[] = [
  "Sir Aldric",
  "Dame Isolde",
  "Ser Corwin",
  "Lady Maren",
  "Sir Godric",
  "Ser Bramwell",
];
