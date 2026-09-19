import { ALL_ARENAS } from "../arenas/registry.js";
import { computeStats, BASE_STATS } from "../powerups/computeStats.js";
import { getWeapon } from "../combat/weapons.js";
import { encode, type InputBitName, type InputFrame } from "../input/bitmask.js";
import { createHazardState, resetHazardState } from "../hazards/step.js";
import { advanceMatchPhase, createMatchPhaseState, type MatchPhaseState } from "../match/phase.js";
import { hashSeed, mulberry32, type Rng } from "../math/rng.js";
import { generateOffers } from "../powerups/offers.js";
import type { PowerUpId } from "../powerups/types.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimPlayer, type SimState } from "../sim/types.js";
import { playerId, WEAPON_IDS, type PlayerId, type WeaponId } from "../types/ids.js";

const ALL_WEAPONS: readonly WeaponId[] = Object.values(WEAPON_IDS);
const A: PlayerId = playerId("botA");
const B: PlayerId = playerId("botB");

/** A generous but finite safety cutoff — real matches finish in a few
 *  thousand ticks; a bot wedged against arena geometry (this heuristic AI
 *  isn't pathfinding-aware) shouldn't spin the simulation forever. A match
 *  that hits this is simply excluded from the tally, not counted as a draw. */
const MAX_TICKS_PER_MATCH = 60_000;

/** A deliberately dumb heuristic, not real AI — plan step "CI/CD
 *  integration" only needs matches that actually finish and draft randomly,
 *  not skilled play; a smarter bot is future tuning work, not this phase's
 *  job. Closes distance, attacks in range, blocks/jumps at low random rates
 *  to avoid completely deterministic exchanges. */
function botFrame(seq: number, self: SimPlayer, opponent: SimPlayer, rng: Rng): InputFrame {
  if (self.action === "Dead") {
    return { seq, bits: 0 };
  }
  const dx = opponent.pos.x - self.pos.x;
  const dist = Math.abs(dx);
  const names: InputBitName[] = [];
  if (dist > 70) {
    names.push(dx >= 0 ? "RIGHT" : "LEFT");
    if (rng() < 0.03) {
      names.push("JUMP");
    }
  } else if (rng() < 0.7) {
    names.push(rng() < 0.85 ? "LIGHT" : "HEAVY");
  } else if (rng() < 0.3) {
    names.push("BLOCK");
  }
  return { seq, bits: encode(names) };
}

/** Respawns both bots at full (power-up-derived) hp/stamina at their
 *  original spawns — a trimmed, script-local stand-in for
 *  `apps/server/src/match/MatchDirector.ts`'s `respawnPlayers`, which can't
 *  be imported here (this script lives in `packages/shared`; `server` is
 *  the other side of ADR 0001's isomorphic boundary). */
function respawn(sim: SimState): SimState {
  const players: Record<PlayerId, SimPlayer> = {};
  for (const [i, id] of [A, B].entries()) {
    const existing = sim.players[id]!;
    const spawn = sim.arena.spawns[i % sim.arena.spawns.length]!;
    const stats = computeStats(BASE_STATS, getWeapon(existing.weapon), existing.powerups ?? {});
    players[id] = {
      ...createSimPlayer(spawn, existing.weapon),
      hp: stats.maxHp,
      stamina: stats.staminaMax,
      powerups: existing.powerups,
      ringOutArmorChargesUsed: existing.ringOutArmorChargesUsed,
    };
  }
  const hazards = resetHazardState(sim.arena.hazards, sim.hazards ?? {}, sim.tick);
  return { ...sim, players, hazards };
}

export interface BalanceMatchResult {
  winnerWeapon: WeaponId;
  loserWeapon: WeaponId;
  winnerPowerups: readonly PowerUpId[];
  loserPowerups: readonly PowerUpId[];
}

/** Runs one full match between two heuristic bots, drafting a random offer
 *  each round (plan step "runs thousands of bot matches with random
 *  drafts") — `null` if it hits {@link MAX_TICKS_PER_MATCH} without a
 *  `matchOver`. Deterministic given `matchSeed`. */
export function runBalanceMatch(
  matchSeed: number,
  weaponA: WeaponId,
  weaponB: WeaponId,
): BalanceMatchResult | null {
  const rng = mulberry32(matchSeed);
  const arena = ALL_ARENAS[Math.floor(rng() * ALL_ARENAS.length) % ALL_ARENAS.length]!;

  let sim: SimState = {
    tick: 0,
    players: {
      [A]: createSimPlayer(arena.spawns[0]!, weaponA),
      [B]: createSimPlayer(arena.spawns[1 % arena.spawns.length]!, weaponB),
    },
    arena,
    rngSeed: matchSeed,
    hazards: createHazardState(arena.hazards),
  };
  let phase: MatchPhaseState = createMatchPhaseState();
  let lastRoundWinner: PlayerId | null = null;
  let seqA = 0;
  let seqB = 0;

  for (let i = 0; i < MAX_TICKS_PER_MATCH; i++) {
    const inputs: Record<PlayerId, InputFrame> = {
      [A]: botFrame(++seqA, sim.players[A]!, sim.players[B]!, rng),
      [B]: botFrame(++seqB, sim.players[B]!, sim.players[A]!, rng),
    };
    const stepResult = step(sim, inputs);
    sim = stepResult.state;

    const aliveIds = ([A, B] as PlayerId[]).filter((id) => sim.players[id]!.action !== "Dead");
    const { state: nextPhase, events } = advanceMatchPhase(phase, {
      tick: sim.tick,
      playerCount: 2,
      aliveIds,
      draftComplete: true, // bots draft synchronously, below, the instant a draftStart event fires.
    });
    phase = nextPhase;

    for (const event of events) {
      if (event.type === "roundStart") {
        sim = respawn(sim);
      }
      if (event.type === "roundEnd") {
        lastRoundWinner = event.winner;
      }
      if (event.type === "draftStart") {
        for (const id of [A, B] as PlayerId[]) {
          const player = sim.players[id]!;
          const placement = id === lastRoundWinner ? 1 : 2;
          const offerRng = mulberry32(hashSeed(matchSeed, event.round, id));
          const offers = generateOffers(offerRng, player.powerups ?? {}, placement);
          const picked = offers[Math.floor(rng() * offers.length)]!;
          const stacks = { ...(player.powerups ?? {}) };
          stacks[picked] = (stacks[picked] ?? 0) + 1;
          sim = { ...sim, players: { ...sim.players, [id]: { ...player, powerups: stacks } } };
        }
      }
      if (event.type === "matchOver" && event.winner) {
        const winner = event.winner;
        const loser = winner === A ? B : A;
        return {
          winnerWeapon: sim.players[winner]!.weapon,
          loserWeapon: sim.players[loser]!.weapon,
          winnerPowerups: Object.keys(sim.players[winner]!.powerups ?? {}) as PowerUpId[],
          loserPowerups: Object.keys(sim.players[loser]!.powerups ?? {}) as PowerUpId[],
        };
      }
    }
  }
  return null;
}

export interface BalanceSummary {
  matches: number;
  unfinished: number;
  winsByWeapon: Partial<Record<WeaponId, number>>;
  appearancesByWeapon: Partial<Record<WeaponId, number>>;
  winsByPowerUp: Partial<Record<PowerUpId, number>>;
  appearancesByPowerUp: Partial<Record<PowerUpId, number>>;
}

function tally<K extends string>(map: Partial<Record<K, number>>, key: K, by = 1): void {
  map[key] = (map[key] ?? 0) + by;
}

/** Runs `matchCount` matches with randomly assigned weapon match-ups
 *  (deterministic given `seed`) and tallies win/appearance counts by weapon
 *  and by power-up — the raw data `formatMarkdown`/`formatCsv` render. */
export function runBalanceSimulation(seed: number, matchCount: number): BalanceSummary {
  const rng = mulberry32(seed);
  const summary: BalanceSummary = {
    matches: 0,
    unfinished: 0,
    winsByWeapon: {},
    appearancesByWeapon: {},
    winsByPowerUp: {},
    appearancesByPowerUp: {},
  };

  for (let i = 0; i < matchCount; i++) {
    const weaponA = ALL_WEAPONS[Math.floor(rng() * ALL_WEAPONS.length)]!;
    const weaponB = ALL_WEAPONS[Math.floor(rng() * ALL_WEAPONS.length)]!;
    const matchSeed = Math.floor(rng() * 2 ** 31);
    const result = runBalanceMatch(matchSeed, weaponA, weaponB);
    if (!result) {
      summary.unfinished += 1;
      continue;
    }
    summary.matches += 1;
    tally(summary.appearancesByWeapon, result.winnerWeapon);
    tally(summary.appearancesByWeapon, result.loserWeapon);
    tally(summary.winsByWeapon, result.winnerWeapon);
    for (const id of result.winnerPowerups) {
      tally(summary.appearancesByPowerUp, id);
      tally(summary.winsByPowerUp, id);
    }
    for (const id of result.loserPowerups) {
      tally(summary.appearancesByPowerUp, id);
    }
  }

  return summary;
}

function winRate(wins: number | undefined, appearances: number | undefined): string {
  if (!appearances) {
    return "n/a";
  }
  return `${(((wins ?? 0) / appearances) * 100).toFixed(1)}%`;
}

export function formatBalanceMarkdown(summary: BalanceSummary): string {
  const lines: string[] = [
    "# Power-up / weapon balance report",
    "",
    `${summary.matches} finished matches, ${summary.unfinished} excluded (hit the simulation's tick cutoff).`,
    "",
    "## Win rate by weapon",
    "",
    "| Weapon | Appearances | Wins | Win rate |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const weapon of Object.keys(summary.appearancesByWeapon).sort() as WeaponId[]) {
    const appearances = summary.appearancesByWeapon[weapon];
    const wins = summary.winsByWeapon[weapon];
    lines.push(`| ${weapon} | ${appearances} | ${wins ?? 0} | ${winRate(wins, appearances)} |`);
  }
  lines.push("", "## Win rate by power-up (of matches where the eventual winner owned it)", "");
  lines.push("| Power-up | Appearances | Wins | Win rate |", "| --- | ---: | ---: | ---: |");
  for (const id of Object.keys(summary.appearancesByPowerUp).sort() as PowerUpId[]) {
    const appearances = summary.appearancesByPowerUp[id];
    const wins = summary.winsByPowerUp[id];
    lines.push(`| ${id} | ${appearances} | ${wins ?? 0} | ${winRate(wins, appearances)} |`);
  }
  return lines.join("\n") + "\n";
}

export function formatBalanceCsv(summary: BalanceSummary): string {
  const lines: string[] = ["kind,id,appearances,wins,winRate"];
  for (const weapon of Object.keys(summary.appearancesByWeapon).sort() as WeaponId[]) {
    const appearances = summary.appearancesByWeapon[weapon]!;
    const wins = summary.winsByWeapon[weapon] ?? 0;
    lines.push(`weapon,${weapon},${appearances},${wins},${(wins / appearances).toFixed(4)}`);
  }
  for (const id of Object.keys(summary.appearancesByPowerUp).sort() as PowerUpId[]) {
    const appearances = summary.appearancesByPowerUp[id]!;
    const wins = summary.winsByPowerUp[id] ?? 0;
    lines.push(`powerup,${id},${appearances},${wins},${(wins / appearances).toFixed(4)}`);
  }
  return lines.join("\n") + "\n";
}
