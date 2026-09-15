import { describe, expect, it } from "vitest";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import { PATCH_RATE, TICK_RATE } from "../config/game.js";
import { playerId } from "../types/ids.js";
import { hold, idle, sequence } from "./bots/scripted.js";
import { NetSim } from "./NetSim.js";

const P1 = playerId("p1");

describe("NetSim", () => {
  it("converges the client's predicted position to the server's within 1px, within 10 ticks after input stops", () => {
    const net = new NetSim({
      arena: TESTBED_ARENA,
      rngSeed: 1,
      latencyMs: 60, // one-way; ~120ms RTT
      jitterMs: 20,
      lossRate: 0.02,
      seed: 7,
    });

    const client = net.addClient(P1, { x: 200, y: 600 });

    const moveTicks = 40;
    const settleTicks = 60;
    const script = sequence(hold(["RIGHT"], moveTicks), idle(settleTicks));

    let convergedAtTick: number | undefined;
    for (let i = 0; i < script.length; i++) {
      net.tick({ [P1]: script[i]! });

      if (i >= moveTicks) {
        const distance = Math.hypot(
          client.predicted.pos.x - net.serverPlayer(P1)!.pos.x,
          client.predicted.pos.y - net.serverPlayer(P1)!.pos.y,
        );
        if (distance <= 1 && convergedAtTick === undefined) {
          convergedAtTick = i - moveTicks;
        }
      }
    }

    expect(convergedAtTick).toBeLessThanOrEqual(10);
  });

  it("keeps correction magnitude bounded — it never grows unboundedly under steady loss/jitter", () => {
    const net = new NetSim({
      arena: TESTBED_ARENA,
      rngSeed: 1,
      latencyMs: 60,
      jitterMs: 20,
      lossRate: 0.02,
      seed: 11,
    });

    const client = net.addClient(P1, { x: 200, y: 600 });
    const script = hold(["RIGHT"], 200);

    let maxCorrection = 0;
    for (const frame of script) {
      const before = { ...client.predicted.pos };
      net.tick({ [P1]: frame });
      const after = client.predicted.pos;
      maxCorrection = Math.max(maxCorrection, Math.hypot(after.x - before.x, after.y - before.y));
    }

    // A single tick's own movement is bounded by max run speed / tick rate;
    // a reconciliation replay shouldn't blow past a small multiple of that.
    const maxPlausibleSingleTickDelta = (400 / TICK_RATE) * 5;
    expect(maxCorrection).toBeLessThan(maxPlausibleSingleTickDelta);
  });

  it("keeps client and server patch cadence at PATCH_RATE", () => {
    const net = new NetSim({ arena: TESTBED_ARENA, rngSeed: 1, latencyMs: 0, seed: 1 });
    net.addClient(P1, { x: 200, y: 600 });

    for (let i = 0; i < TICK_RATE; i++) {
      net.tick({ [P1]: { seq: i + 1, bits: 0 } });
    }

    expect(net.patchesSentTo(P1)).toBe(PATCH_RATE);
  });
});
