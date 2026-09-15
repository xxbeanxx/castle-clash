import {
  Reconciler as SharedReconciler,
  schemaToSimPlayer,
  type InputFrame,
  type PlayerState,
  type ReconcilerOptions,
  type SimPlayer,
  type Vec,
} from "@castle-clash/shared";

/**
 * Wires the shared, framework-free `Reconciler` (predict/replay via
 * `GameSimulation.step`) to Colyseus's actual network representation: the
 * one piece that's genuinely client-specific is decoding a `PlayerState`
 * schema instance into the plain `SimPlayer` the shared core replays from.
 */
export class Reconciler {
  readonly #core: SharedReconciler;

  constructor(initialPlayer: SimPlayer, options: ReconcilerOptions) {
    this.#core = new SharedReconciler(initialPlayer, options);
  }

  get predicted(): SimPlayer {
    return this.#core.predicted;
  }

  get visualPosition(): Vec {
    return this.#core.visualPosition;
  }

  predict(input: InputFrame): SimPlayer {
    return this.#core.predict(input);
  }

  tick(): void {
    this.#core.tick();
  }

  /** Call when a patch updates the local player's authoritative schema entry. */
  reconcileFromSchema(schema: PlayerState): SimPlayer {
    return this.#core.reconcile(schemaToSimPlayer(schema), schema.lastProcessedSeq);
  }
}
