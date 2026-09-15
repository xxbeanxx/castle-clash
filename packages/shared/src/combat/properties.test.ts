import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import { encode, type InputBitName, type InputFrame } from "../input/bitmask.js";
import { MAX_HP, MAX_STAMINA } from "../config/game.js";
import { hashState } from "../math/hash.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimState } from "../sim/types.js";
import { playerId } from "../types/ids.js";

const PLAYER_A = playerId("a");
const PLAYER_B = playerId("b");

// Close enough together that every weapon's reach can connect, so random
// scripts actually exercise resolveCombat instead of only ever whiffing.
function initialState(): SimState {
  return {
    tick: 0,
    players: {
      [PLAYER_A]: createSimPlayer({ x: 200, y: 600 }),
      [PLAYER_B]: { ...createSimPlayer({ x: 240, y: 600 }), facing: -1 as const },
    },
    arena: TESTBED_ARENA,
    rngSeed: 7,
  };
}

const COMBAT_BIT_NAMES: InputBitName[] = [
  "LEFT",
  "RIGHT",
  "JUMP",
  "LIGHT",
  "HEAVY",
  "BLOCK",
  "DODGE",
];

const frameArb = fc
  .array(fc.constantFrom(...COMBAT_BIT_NAMES), { maxLength: COMBAT_BIT_NAMES.length })
  .map((names) => encode(Array.from(new Set(names))));

const scriptArb = fc.array(fc.record({ a: frameArb, b: frameArb }), {
  minLength: 1,
  maxLength: 200,
});

function runScript(
  script: readonly { a: number; b: number }[],
): { states: SimState[]; final: SimState } {
  let state = initialState();
  const states: SimState[] = [state];
  for (const [i, frame] of script.entries()) {
    const inputs: Record<string, InputFrame> = {
      [PLAYER_A]: { seq: i + 1, bits: frame.a },
      [PLAYER_B]: { seq: i + 1, bits: frame.b },
    };
    state = step(state, inputs).state;
    states.push(state);
  }
  return { states, final: state };
}

describe("combat properties", () => {
  it("determinism holds for random combat input scripts", () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        const first = runScript(script);
        const second = runScript(script);
        for (let i = 0; i < first.states.length; i++) {
          expect(hashState(first.states[i]!)).toBe(hashState(second.states[i]!));
        }
      }),
      { seed: Number(__FC_SEED__) || undefined },
    );
  });

  it("keeps hp and stamina within [0, max] at every tick", () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        const { states } = runScript(script);
        for (const state of states) {
          for (const player of Object.values(state.players)) {
            expect(player.hp).toBeGreaterThanOrEqual(0);
            expect(player.hp).toBeLessThanOrEqual(MAX_HP);
            expect(player.stamina).toBeGreaterThanOrEqual(0);
            expect(player.stamina).toBeLessThanOrEqual(MAX_STAMINA);
          }
        }
      }),
      { seed: Number(__FC_SEED__) || undefined },
    );
  });

  it("Dead is terminal — once dead, a player never leaves Dead within the run", () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        const { states } = runScript(script);
        const diedAt: Partial<Record<string, number>> = {};

        for (const [tickIndex, state] of states.entries()) {
          for (const [id, player] of Object.entries(state.players)) {
            const firstDeath = diedAt[id];
            if (firstDeath !== undefined) {
              expect(player.action).toBe("Dead");
            } else if (player.action === "Dead") {
              diedAt[id] = tickIndex;
            }
          }
        }
      }),
      { seed: Number(__FC_SEED__) || undefined },
    );
  });
});
