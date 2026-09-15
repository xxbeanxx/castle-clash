import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import { encode, type InputBitName, type InputFrame } from "../input/bitmask.js";
import { hashState } from "../math/hash.js";
import { playerId } from "../types/ids.js";
import { step } from "./GameSimulation.js";
import { createSimPlayer, type SimState } from "./types.js";

const PLAYER_A = playerId("a");

function initialState(): SimState {
  return {
    tick: 0,
    players: { [PLAYER_A]: createSimPlayer({ x: 200, y: 600 }) },
    arena: TESTBED_ARENA,
    rngSeed: 42,
  };
}

function runScript(script: readonly InputFrame[]): SimState {
  let state = initialState();
  for (const frame of script) {
    state = step(state, { [PLAYER_A]: frame }).state;
  }
  return state;
}

describe("determinism", () => {
  it("produces an identical hash at every tick for the same seed and input script", () => {
    const script: InputFrame[] = Array.from({ length: 200 }, (_, i) => ({
      seq: i + 1,
      bits: encode(i % 30 < 15 ? ["RIGHT"] : i % 30 < 20 ? ["JUMP", "RIGHT"] : []),
    }));

    let stateA = initialState();
    let stateB = initialState();

    for (const frame of script) {
      stateA = step(stateA, { [PLAYER_A]: frame }).state;
      stateB = step(stateB, { [PLAYER_A]: frame }).state;
      expect(hashState(stateA)).toBe(hashState(stateB));
    }
  });

  it("holds for random input scripts (property test)", () => {
    const bitNames: InputBitName[] = ["LEFT", "RIGHT", "UP", "DOWN", "JUMP"];
    const frameArb = fc
      .array(fc.constantFrom(...bitNames), { maxLength: bitNames.length })
      .map((names) => encode(Array.from(new Set(names))));

    fc.assert(
      fc.property(fc.array(frameArb, { minLength: 1, maxLength: 150 }), (bitsScript) => {
        const script = bitsScript.map((bits, i) => ({ seq: i + 1, bits }));
        const finalA = runScript(script);
        const finalB = runScript(script);
        expect(hashState(finalA)).toBe(hashState(finalB));
      }),
      { seed: Number(__FC_SEED__) || undefined },
    );
  });
});
