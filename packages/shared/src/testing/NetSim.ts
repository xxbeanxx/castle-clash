import type { ArenaRuntime } from "../arenas/types.js";
import { PATCH_RATE, TICK_RATE } from "../config/game.js";
import type { InputFrame } from "../input/bitmask.js";
import type { Vec } from "../math/vec.js";
import { mulberry32, type Rng } from "../math/rng.js";
import { Reconciler } from "../net/Reconciler.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimPlayer, type SimState } from "../sim/types.js";
import type { PlayerId } from "../types/ids.js";

export interface NetSimOptions {
  arena: ArenaRuntime;
  rngSeed: number;
  /** One-way base latency in ms, applied to both uplink and downlink. */
  latencyMs: number;
  /** Uniform +/- jitter in ms added to each message's latency. */
  jitterMs?: number;
  /** Chance (0..1) any single message is dropped in transit. */
  lossRate?: number;
  /** Seeds NetSim's own jitter/loss RNG — independent of the sim's `rngSeed`. */
  seed?: number;
}

interface Envelope<T> {
  deliverAtTick: number;
  payload: T;
}

interface Patch {
  player: SimPlayer;
  lastProcessedSeq: number;
}

/**
 * Links one authoritative `GameSimulation` to K client `Reconciler`s over an
 * in-memory "network" with configurable latency/jitter/loss — the same
 * prediction/reconciliation code the real client uses (`../net/Reconciler`),
 * exercised without sockets, a Colyseus room, or a browser.
 */
export class NetSim {
  readonly #arena: ArenaRuntime;
  readonly #rngSeed: number;
  readonly #latencyMs: number;
  readonly #jitterMs: number;
  readonly #lossRate: number;
  readonly #rng: Rng;
  readonly #ticksPerPatch: number;

  #serverState: SimState;
  #tick = 0;

  readonly #clients = new Map<PlayerId, Reconciler>();
  readonly #lastReceivedInput = new Map<PlayerId, InputFrame>();
  readonly #lastProcessedSeq = new Map<PlayerId, number>();
  readonly #patchesSent = new Map<PlayerId, number>();
  #uplink: Envelope<{ id: PlayerId; input: InputFrame }>[] = [];
  readonly #downlink = new Map<PlayerId, Envelope<Patch>[]>();

  constructor(options: NetSimOptions) {
    this.#arena = options.arena;
    this.#rngSeed = options.rngSeed;
    this.#latencyMs = options.latencyMs;
    this.#jitterMs = options.jitterMs ?? 0;
    this.#lossRate = options.lossRate ?? 0;
    this.#rng = mulberry32(options.seed ?? 1);
    this.#ticksPerPatch = TICK_RATE / PATCH_RATE;
    this.#serverState = { tick: 0, players: {}, arena: this.#arena, rngSeed: this.#rngSeed };
  }

  addClient(id: PlayerId, spawn: Vec): Reconciler {
    this.#serverState = {
      ...this.#serverState,
      players: { ...this.#serverState.players, [id]: createSimPlayer(spawn) },
    };
    const reconciler = new Reconciler(createSimPlayer(spawn), {
      arena: this.#arena,
      rngSeed: this.#rngSeed,
      localId: id,
    });
    this.#clients.set(id, reconciler);
    this.#lastProcessedSeq.set(id, 0);
    this.#patchesSent.set(id, 0);
    this.#downlink.set(id, []);
    return reconciler;
  }

  serverPlayer(id: PlayerId): SimPlayer | undefined {
    return this.#serverState.players[id];
  }

  patchesSentTo(id: PlayerId): number {
    return this.#patchesSent.get(id) ?? 0;
  }

  /** Advances one tick: each client predicts+sends `inputs[id]`, the network
   *  delivers whatever's due, the server steps, and on patch ticks a
   *  correction is enqueued back to every client. */
  tick(inputs: Readonly<Partial<Record<PlayerId, InputFrame>>>): void {
    this.#tick += 1;

    for (const [id, reconciler] of this.#clients) {
      const input = inputs[id];
      if (input) {
        reconciler.predict(input);
        this.#send(this.#uplink, { id, input });
      }
      reconciler.tick();
    }

    this.#uplink = this.#deliverDue(this.#uplink, (msg) => {
      this.#lastReceivedInput.set(msg.id, msg.input);
    });

    const serverInputs: Partial<Record<PlayerId, InputFrame>> = {};
    for (const id of this.#clients.keys()) {
      const latest = this.#lastReceivedInput.get(id);
      if (latest) {
        serverInputs[id] = latest;
        this.#lastProcessedSeq.set(id, latest.seq);
      }
    }
    this.#serverState = step(this.#serverState, serverInputs).state;

    if (this.#tick % this.#ticksPerPatch === 0) {
      for (const id of this.#clients.keys()) {
        this.#send(this.#downlink.get(id)!, {
          player: this.#serverState.players[id]!,
          lastProcessedSeq: this.#lastProcessedSeq.get(id) ?? 0,
        });
        this.#patchesSent.set(id, (this.#patchesSent.get(id) ?? 0) + 1);
      }
    }

    for (const [id, queue] of this.#downlink) {
      const reconciler = this.#clients.get(id)!;
      this.#downlink.set(
        id,
        this.#deliverDue(queue, (patch) => {
          reconciler.reconcile(patch.player, patch.lastProcessedSeq);
        }),
      );
    }
  }

  #send<T>(queue: Envelope<T>[], payload: T): void {
    if (this.#rng() < this.#lossRate) {
      return;
    }
    const jitter = this.#jitterMs === 0 ? 0 : (this.#rng() * 2 - 1) * this.#jitterMs;
    const delayMs = Math.max(0, this.#latencyMs + jitter);
    const delayTicks = Math.round((delayMs / 1000) * TICK_RATE);
    queue.push({ deliverAtTick: this.#tick + delayTicks, payload });
  }

  #deliverDue<T>(queue: Envelope<T>[], onDeliver: (payload: T) => void): Envelope<T>[] {
    const remaining: Envelope<T>[] = [];
    for (const envelope of queue) {
      if (envelope.deliverAtTick <= this.#tick) {
        onDeliver(envelope.payload);
      } else {
        remaining.push(envelope);
      }
    }
    return remaining;
  }
}
