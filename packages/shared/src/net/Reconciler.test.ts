import { describe, expect, it } from "vitest";
import { TESTBED_ARENA } from "../arenas/testbed.js";
import { encode } from "../input/bitmask.js";
import { playerId } from "../types/ids.js";
import { createSimPlayer } from "../sim/types.js";
import { Reconciler } from "./Reconciler.js";

const LOCAL = playerId("local");
const RIGHT = encode(["RIGHT"]);

describe("Reconciler", () => {
  it("predicts locally so the local player moves before any server ack", () => {
    const reconciler = new Reconciler(createSimPlayer({ x: 200, y: 600 }), {
      arena: TESTBED_ARENA,
      rngSeed: 1,
      localId: LOCAL,
    });

    const before = reconciler.predicted.pos.x;
    reconciler.predict({ seq: 1, bits: RIGHT });
    expect(reconciler.predicted.pos.x).toBeGreaterThan(before);
  });

  it("leaves the predicted player unchanged when the server ack matches the prediction exactly", () => {
    const reconciler = new Reconciler(createSimPlayer({ x: 200, y: 600 }), {
      arena: TESTBED_ARENA,
      rngSeed: 1,
      localId: LOCAL,
    });

    const predicted = reconciler.predict({ seq: 1, bits: RIGHT });
    const result = reconciler.reconcile(predicted, 1);
    expect(result.pos).toEqual(predicted.pos);
  });

  it("replays unacked pending inputs on top of a corrected server state", () => {
    const reconciler = new Reconciler(createSimPlayer({ x: 200, y: 600 }), {
      arena: TESTBED_ARENA,
      rngSeed: 1,
      localId: LOCAL,
    });

    reconciler.predict({ seq: 1, bits: RIGHT });
    const predicted2 = reconciler.predict({ seq: 2, bits: RIGHT });

    // Server has only processed seq 1 so far, from an identical starting point —
    // reconciling should replay seq 2 and land back where prediction already was.
    const serverAfterSeq1 = createSimPlayer({ x: 200, y: 600 });
    const result = reconciler.reconcile(serverAfterSeq1, 0);
    expect(result.pos.x).not.toBe(serverAfterSeq1.pos.x);
    expect(result).toEqual(predicted2);
  });

  it("drops acked inputs from the pending buffer", () => {
    const reconciler = new Reconciler(createSimPlayer({ x: 200, y: 600 }), {
      arena: TESTBED_ARENA,
      rngSeed: 1,
      localId: LOCAL,
    });

    reconciler.predict({ seq: 1, bits: RIGHT });
    reconciler.predict({ seq: 2, bits: RIGHT });
    expect(reconciler.pendingCount).toBe(2);

    reconciler.reconcile(createSimPlayer({ x: 200, y: 600 }), 2);
    expect(reconciler.pendingCount).toBe(0);
  });

  it("smooths a small correction over the configured window instead of snapping", () => {
    const reconciler = new Reconciler(createSimPlayer({ x: 200, y: 600 }), {
      arena: TESTBED_ARENA,
      rngSeed: 1,
      localId: LOCAL,
      snapThresholdPx: 4,
      smoothingTicks: 6,
    });

    reconciler.predict({ seq: 1, bits: RIGHT });
    const serverPlayer = createSimPlayer({ x: 201, y: 600 }); // 1px off — under threshold
    reconciler.reconcile(serverPlayer, 1);

    const visualBefore = reconciler.visualPosition.x;
    expect(visualBefore).not.toBe(reconciler.predicted.pos.x);

    for (let i = 0; i < 6; i++) reconciler.tick();
    expect(reconciler.visualPosition.x).toBe(reconciler.predicted.pos.x);
  });

  it("snaps immediately when the correction exceeds the threshold", () => {
    const reconciler = new Reconciler(createSimPlayer({ x: 200, y: 600 }), {
      arena: TESTBED_ARENA,
      rngSeed: 1,
      localId: LOCAL,
      snapThresholdPx: 4,
      smoothingTicks: 6,
    });

    reconciler.predict({ seq: 1, bits: RIGHT });
    const serverPlayer = createSimPlayer({ x: 500, y: 600 }); // way off
    reconciler.reconcile(serverPlayer, 1);

    expect(reconciler.visualPosition.x).toBe(reconciler.predicted.pos.x);
  });
});
