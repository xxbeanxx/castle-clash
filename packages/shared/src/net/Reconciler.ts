import type { ArenaRuntime } from "../arenas/types.js";
import { step } from "../sim/GameSimulation.js";
import type { SimPlayer, SimState } from "../sim/types.js";
import type { InputFrame } from "../input/bitmask.js";
import type { Vec } from "../math/vec.js";
import type { PlayerId } from "../types/ids.js";

export interface ReconcilerOptions {
  arena: ArenaRuntime;
  rngSeed: number;
  localId: PlayerId;
  /** Correction magnitude (px) below which it's smoothed instead of snapped. */
  snapThresholdPx?: number;
  /** Ticks over which a smoothed correction decays to zero (100ms @ 60Hz = 6). */
  smoothingTicks?: number;
}

/**
 * Client-side prediction + server reconciliation for the local player, as a
 * pure, framework-free class (ADR 0001): it only knows `GameSimulation.step`
 * and plain `SimPlayer`/`InputFrame` values, never Colyseus or the DOM. Both
 * `apps/client/app/game/net/Reconciler.ts` (wiring this to a live Room) and
 * `shared/testing/NetSim` (headless convergence tests) drive the same
 * algorithm, so there's exactly one implementation to get right.
 *
 * Since Phase 3 has no player-vs-player interaction (geometry collision
 * only), replaying the local player's pending inputs in isolation — a
 * one-player `SimState` — produces the same trajectory `GameSimulation.step`
 * would over the full multiplayer state. A later phase that adds
 * player-vs-player collision will need to revisit this.
 *
 * Phase 4 (combat) deliberately does NOT revisit it for hit resolution: the
 * plan's own spec is "the local player's action and animation start are
 * predicted, but HP changes only on server confirmation." Replaying in
 * isolation means `combat/resolve.ts` never sees an opponent locally, so a
 * predicted attack always resolves as a whiff on this client and any
 * incoming hit/block/dodge outcome only ever arrives via `reconcile()` from
 * the server — which is exactly the "HP only on server confirmation" rule,
 * not a gap this class still owes Phase 4. What Phase 4 *does* get for
 * free here is local FSM prediction (attack windup, block, dodge, hitstun
 * countdown) for the local player's own action state, since none of that
 * depends on the opponent being present.
 */
export class Reconciler {
  readonly #arena: ArenaRuntime;
  readonly #rngSeed: number;
  readonly #localId: PlayerId;
  readonly #snapThresholdPx: number;
  readonly #smoothingTicks: number;

  #predicted: SimPlayer;
  #pending: InputFrame[] = [];
  #offsetOrigin: Vec = { x: 0, y: 0 };
  #offsetTicksRemaining = 0;

  constructor(initialPlayer: SimPlayer, options: ReconcilerOptions) {
    this.#predicted = initialPlayer;
    this.#arena = options.arena;
    this.#rngSeed = options.rngSeed;
    this.#localId = options.localId;
    this.#snapThresholdPx = options.snapThresholdPx ?? 4;
    this.#smoothingTicks = options.smoothingTicks ?? 6;
  }

  get predicted(): SimPlayer {
    return this.#predicted;
  }

  get pendingCount(): number {
    return this.#pending.length;
  }

  /** Apply an input immediately for local responsiveness, and remember it for replay. */
  predict(input: InputFrame): SimPlayer {
    this.#pending.push(input);
    this.#predicted = this.#stepPlayer(this.#predicted, input);
    return this.#predicted;
  }

  /**
   * Apply an authoritative correction: drop acked inputs, reset to the
   * server's player, and replay whatever's still pending on top of it.
   */
  reconcile(serverPlayer: SimPlayer, lastProcessedSeq: number): SimPlayer {
    this.#pending = this.#pending.filter((input) => input.seq > lastProcessedSeq);

    const before = this.#predicted;
    let replayed = serverPlayer;
    for (const input of this.#pending) {
      replayed = this.#stepPlayer(replayed, input);
    }
    this.#predicted = replayed;

    const errX = before.pos.x - replayed.pos.x;
    const errY = before.pos.y - replayed.pos.y;
    const errorPx = Math.hypot(errX, errY);

    if (errorPx > this.#snapThresholdPx) {
      this.#offsetOrigin = { x: 0, y: 0 };
      this.#offsetTicksRemaining = 0;
    } else if (errorPx > 0) {
      this.#offsetOrigin = { x: errX, y: errY };
      this.#offsetTicksRemaining = this.#smoothingTicks;
    }

    return this.#predicted;
  }

  /** Decay the visual smoothing offset by one tick. Call once per sim tick. */
  tick(): void {
    if (this.#offsetTicksRemaining > 0) {
      this.#offsetTicksRemaining -= 1;
    }
  }

  /** The predicted position plus any decaying visual-only correction offset. */
  get visualPosition(): Vec {
    const t = this.#smoothingTicks > 0 ? this.#offsetTicksRemaining / this.#smoothingTicks : 0;
    return {
      x: this.#predicted.pos.x + this.#offsetOrigin.x * t,
      y: this.#predicted.pos.y + this.#offsetOrigin.y * t,
    };
  }

  #stepPlayer(player: SimPlayer, input: InputFrame): SimPlayer {
    const state: SimState = {
      tick: 0,
      players: { [this.#localId]: player },
      arena: this.#arena,
      rngSeed: this.#rngSeed,
    };
    return step(state, { [this.#localId]: input }).state.players[this.#localId]!;
  }
}
