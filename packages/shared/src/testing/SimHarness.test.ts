import { describe, expect, it } from "vitest";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import { playerId } from "../types/ids.js";
import { createSimPlayer } from "../sim/types.js";
import { hold, idle, sequence } from "./bots/scripted.js";
import { SimHarness } from "./SimHarness.js";

const P1 = playerId("p1");

describe("SimHarness", () => {
  it("runs N ticks with scripted inputs and advances tick count", () => {
    const harness = new SimHarness({
      tick: 0,
      players: { [P1]: createSimPlayer({ x: 200, y: 600 }) },
      arena: TESTBED_ARENA,
      rngSeed: 1,
    });

    const script = hold(["RIGHT"], 30);
    harness.runTicks(script.map((frame) => ({ [P1]: frame })));

    expect(harness.state.tick).toBe(30);
    expect(harness.state.players[P1]!.pos.x).toBeGreaterThan(200);
  });

  it("collects emitted sim events across ticks", () => {
    const harness = new SimHarness({
      tick: 0,
      players: { [P1]: createSimPlayer({ x: 200, y: 600 }) },
      arena: TESTBED_ARENA,
      rngSeed: 1,
    });

    const script = sequence(idle(40), hold(["JUMP"], 1));
    harness.runTicks(script.map((frame) => ({ [P1]: frame })));

    expect(harness.events.some((e) => e.type === "land")).toBe(true);
    expect(harness.events.some((e) => e.type === "jump")).toBe(true);
  });
});
