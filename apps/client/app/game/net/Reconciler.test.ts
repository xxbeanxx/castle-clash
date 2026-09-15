import {
  createSimPlayer,
  encode,
  PlayerState,
  playerId,
  TESTBED_ARENA,
} from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import { Reconciler } from "./Reconciler.js";

const LOCAL = playerId("local");
const RIGHT = encode(["RIGHT"]);

function syntheticSnapshot(overrides: Partial<PlayerState>): PlayerState {
  const player = new PlayerState();
  Object.assign(player, overrides);
  return player;
}

describe("client Reconciler", () => {
  it("predicts locally ahead of any server ack", () => {
    const reconciler = new Reconciler(createSimPlayer({ x: 200, y: 600 }), {
      arena: TESTBED_ARENA,
      rngSeed: 1,
      localId: LOCAL,
    });

    reconciler.predict({ seq: 1, bits: RIGHT });
    expect(reconciler.predicted.pos.x).toBeGreaterThan(200);
  });

  it("decodes a synthetic PlayerState snapshot and reconciles against it", () => {
    const reconciler = new Reconciler(createSimPlayer({ x: 200, y: 600 }), {
      arena: TESTBED_ARENA,
      rngSeed: 1,
      localId: LOCAL,
    });

    reconciler.predict({ seq: 1, bits: RIGHT });
    reconciler.predict({ seq: 2, bits: RIGHT });

    const snapshot = syntheticSnapshot({
      x: 200,
      y: 600,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: false,
      coyoteTicks: 0,
      jumpBufferTicks: 0,
      dropThroughTicks: 0,
      lastProcessedSeq: 1,
    });

    const result = reconciler.reconcileFromSchema(snapshot);
    // seq 1 is acked, seq 2 replays on top of the snapshot.
    expect(result.pos.x).toBeGreaterThan(200);
    expect(result).toEqual(reconciler.predicted);
  });
});
