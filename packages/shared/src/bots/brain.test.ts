import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALL_ARENAS } from "../arenas/registry.js";
import { PIT_ARENA } from "../arenas/pit.js";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import { createHazardState } from "../hazards/step.js";
import { has } from "../input/bitmask.js";
import { hashState } from "../math/hash.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimState } from "../sim/types.js";
import { playerId, WEAPON_IDS } from "../types/ids.js";
import { BotBrain } from "./brain.js";
import { runDuel } from "./duel.js";

const ME = playerId("me");
const FOE = playerId("foe");

function twoPlayers(mePos: { x: number; y: number }, foePos: { x: number; y: number }): SimState {
  return {
    tick: 0,
    players: {
      [ME]: { ...createSimPlayer(mePos), grounded: true },
      [FOE]: { ...createSimPlayer(foePos), grounded: true, facing: -1 },
    },
    arena: TESTBED_ARENA,
    rngSeed: 1,
    hazards: createHazardState(TESTBED_ARENA.hazards),
  };
}

describe("BotBrain", () => {
  it("numbers its frames 1, 2, 3, ... whatever it decides", () => {
    const brain = new BotBrain(ME, "normal", 1);
    const sim = twoPlayers({ x: 200, y: 632 }, { x: 900, y: 632 });
    expect([brain.decide(sim).seq, brain.decide(sim).seq, brain.decide(sim).seq]).toEqual([
      1, 2, 3,
    ]);
  });

  it("runs toward a distant target", () => {
    const brain = new BotBrain(ME, "normal", 1);
    const frame = brain.decide(twoPlayers({ x: 200, y: 632 }, { x: 900, y: 632 }));
    expect(has(frame.bits, "RIGHT")).toBe(true);
    expect(has(frame.bits, "LEFT")).toBe(false);
  });

  it("turns to face a target it is standing next to before it swings", () => {
    const brain = new BotBrain(ME, "hard", 1);
    // The foe is to the left, close enough to hit; the bot faces right.
    const sim = twoPlayers({ x: 400, y: 632 }, { x: 350, y: 632 });
    const frame = brain.decide(sim);
    expect(has(frame.bits, "LEFT")).toBe(true);
    expect(has(frame.bits, "LIGHT") || has(frame.bits, "HEAVY")).toBe(false);
  });

  it("does nothing while it cannot act, and when nobody is left to fight", () => {
    const helpless = twoPlayers({ x: 200, y: 632 }, { x: 900, y: 632 });
    helpless.players[ME] = { ...helpless.players[ME]!, action: "HitStun" };
    expect(new BotBrain(ME, "hard", 1).decide(helpless).bits).toBe(0);

    const alone = twoPlayers({ x: 200, y: 632 }, { x: 900, y: 632 });
    alone.players[FOE] = { ...alone.players[FOE]!, action: "Dead" };
    expect(new BotBrain(ME, "hard", 1).decide(alone).bits).toBe(0);
  });

  it("a dummy never presses anything", () => {
    const brain = new BotBrain(ME, "dummy", 1);
    let sim = twoPlayers({ x: 200, y: 632 }, { x: 260, y: 632 });
    for (let i = 0; i < 120; i++) {
      const frame = brain.decide(sim);
      expect(frame.bits).toBe(0);
      sim = step(sim, { [ME]: frame }).state;
    }
  });

  it("steps off nothing: never walks itself off the edge of a ledge toward a target across a void", () => {
    const ledge = {
      ...TESTBED_ARENA,
      solids: [{ x: 0, y: 680, w: 400, h: 40 }],
    };
    let sim: SimState = {
      tick: 0,
      players: {
        [ME]: { ...createSimPlayer({ x: 100, y: 632 }), grounded: true },
        [FOE]: { ...createSimPlayer({ x: 900, y: 632 }), grounded: true },
      },
      arena: ledge,
      rngSeed: 1,
      hazards: createHazardState([]),
    };
    const brain = new BotBrain(ME, "hard", 1);
    for (let i = 0; i < 600; i++) {
      sim = step(sim, { [ME]: brain.decide(sim), [FOE]: { seq: i + 1, bits: 0 } }).state;
      expect(sim.players[ME]!.action).not.toBe("Dead");
    }
    expect(sim.players[ME]!.pos.x).toBeLessThan(400);
  });
});

describe("determinism", () => {
  it("the same seeds give the same duel to the last bit of state", () => {
    const a = runDuel("normal", "hard", { arena: ALL_ARENAS[1]!, seed: 5 });
    const b = runDuel("normal", "hard", { arena: ALL_ARENAS[1]!, seed: 5 });
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.ticks).toBe(b.ticks);
  });

  it("holds for any seed, tier and arena (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.constantFrom("easy", "normal", "hard"),
        fc.constantFrom("easy", "normal", "hard"),
        fc.integer({ min: 0, max: ALL_ARENAS.length - 1 }),
        (seed, kindA, kindB, arenaIndex) => {
          const arena = ALL_ARENAS[arenaIndex]!;
          const first = runDuel(kindA, kindB, { arena, seed });
          const second = runDuel(kindA, kindB, { arena, seed });
          expect(hashState(first.state)).toBe(hashState(second.state));
        },
      ),
      { numRuns: 12 },
    );
  });

  it("different seeds play differently", () => {
    const hashes = new Set(
      [1, 2, 3, 4].map((seed) => hashState(runDuel("normal", "normal", { seed }).state)),
    );
    expect(hashes.size).toBeGreaterThan(1);
  });
});

describe("every arena", () => {
  it.each(ALL_ARENAS.map((arena) => [arena.id, arena] as const))(
    "%s: a normal bot kills a standing dummy",
    (_id, arena) => {
      const result = runDuel("normal", "dummy", { arena });
      expect(result.winner).toBe("A");
      expect(result.ticks).toBeLessThan(900);
    },
  );

  it.each(ALL_ARENAS.map((arena) => [arena.id, arena] as const))(
    "%s: two normal bots do not run off or stand around forever on most seeds",
    (_id, arena) => {
      const finished = [1, 2, 3, 4, 5, 6].filter(
        (seed) => runDuel("normal", "normal", { arena, seed }).winner !== null,
      );
      // Some rooms have layouts a bot without a pathfinder can stall in; sudden death ends those
      // in a real match. "Most" keeps this an early warning, not a flake.
      expect(finished.length).toBeGreaterThanOrEqual(4);
    },
  );

  it("Pit: a bot crosses the bridge (its kill zone must not overlap the planks)", () => {
    // The bot on the left ledge must get to a dummy on the right one.
    const result = runDuel("hard", "dummy", { arena: PIT_ARENA });
    expect(result.winner).toBe("A");
  });
});

describe("difficulty is a measured property", () => {
  /** Rounds won by `strong` out of every arena x seed x side. */
  function winShare(strong: "easy" | "normal" | "hard", weak: "easy" | "normal" | "hard"): number {
    let strongWins = 0;
    let decided = 0;
    for (const arena of ALL_ARENAS) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const flip of [false, true]) {
          const result = runDuel(strong, weak, {
            arena,
            seed,
            flip,
            weaponA: WEAPON_IDS.SWORD,
            weaponB: WEAPON_IDS.SWORD,
          });
          if (result.winner) {
            decided += 1;
            strongWins += result.winner === "A" ? 1 : 0;
          }
        }
      }
    }
    return strongWins / decided;
  }

  it("normal beats easy clearly", () => {
    expect(winShare("normal", "easy")).toBeGreaterThan(0.7);
  });

  it("hard beats easy clearly", () => {
    expect(winShare("hard", "easy")).toBeGreaterThan(0.7);
  });

  it("hard beats normal", () => {
    expect(winShare("hard", "normal")).toBeGreaterThan(0.55);
  });

  it("time to kill a standing target orders the tiers: easy is slowest", () => {
    const mean = (kind: "easy" | "normal" | "hard"): number => {
      const times = ALL_ARENAS.map((arena) => runDuel(kind, "dummy", { arena }).ticks);
      return times.reduce((sum, ticks) => sum + ticks, 0) / times.length;
    };
    const [easy, normal, hard] = [mean("easy"), mean("normal"), mean("hard")];
    expect(easy).toBeGreaterThan(normal * 1.2);
    expect(hard).toBeLessThanOrEqual(normal);
  });
});
