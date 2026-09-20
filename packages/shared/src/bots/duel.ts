import { ALL_ARENAS } from "../arenas/registry.js";
import type { ArenaDefinition } from "../arenas/types.js";
import { createHazardState } from "../hazards/step.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimState } from "../sim/types.js";
import { playerId, WEAPON_IDS, type WeaponId } from "../types/ids.js";
import { BotBrain } from "./brain.js";
import type { BotKind } from "./tiers.js";

const A = playerId("botA");
const B = playerId("botB");

/** Long enough for any round to end by KO or a ring-out; a stalemate returns `null`. */
const MAX_DUEL_TICKS = 3600;

export interface DuelOptions {
  readonly arena?: ArenaDefinition;
  readonly weaponA?: WeaponId;
  readonly weaponB?: WeaponId;
  readonly seed?: number;
  /** Swap the two spawn points, to cancel out any advantage of a side. */
  readonly flip?: boolean;
}

export interface DuelResult {
  readonly winner: "A" | "B" | null;
  readonly ticks: number;
  /** The state on the tick the round ended (or the cutoff). */
  readonly state: SimState;
}

/**
 * One round between two bots of the given kinds on one arena, no match flow, no draft: the smallest
 * experiment that answers "does this tier beat that one". Deterministic in `seed`. Test and balance
 * tooling only; the game itself never calls this.
 */
export function runDuel(kindA: BotKind, kindB: BotKind, options: DuelOptions = {}): DuelResult {
  const arena = options.arena ?? ALL_ARENAS[0]!;
  const seed = options.seed ?? 1;
  const last = arena.spawns.length - 1;
  const brainA = new BotBrain(A, kindA, seed * 2 + 1);
  const brainB = new BotBrain(B, kindB, seed * 2 + 2);
  let sim: SimState = {
    tick: 0,
    players: {
      [A]: createSimPlayer(
        arena.spawns[options.flip ? last : 0]!,
        options.weaponA ?? WEAPON_IDS.SWORD,
      ),
      [B]: createSimPlayer(
        arena.spawns[options.flip ? 0 : last]!,
        options.weaponB ?? WEAPON_IDS.SWORD,
      ),
    },
    arena,
    rngSeed: seed,
    hazards: createHazardState(arena.hazards),
  };

  for (let i = 0; i < MAX_DUEL_TICKS; i++) {
    sim = step(sim, { [A]: brainA.decide(sim), [B]: brainB.decide(sim) }).state;
    const aDead = sim.players[A]!.action === "Dead";
    const bDead = sim.players[B]!.action === "Dead";
    if (aDead || bDead) {
      return { winner: aDead && bDead ? null : aDead ? "B" : "A", ticks: sim.tick, state: sim };
    }
  }
  return { winner: null, ticks: sim.tick, state: sim };
}
