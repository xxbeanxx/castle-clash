import type { Room } from "colyseus";

export interface FixedStep {
  /** Fixed step in seconds — always `1 / tickRate`, never a measured delta,
   *  so `GameSimulation.step()` sees identical dt on every tick. */
  dt: number;
  tick: number;
}

export type TickCallback = (step: FixedStep) => void;

export interface TickDriver {
  start(callback: TickCallback): void;
  stop(): void;
}

/**
 * `setFixedTimestep` (not the deprecated `setTimestep`) hands a `StepContext`
 * with a fixed `dt`/`tick` driven by a framework-owned accumulator — the
 * measured wall-clock delta never reaches the callback, which is what
 * `GameSimulation.step()`'s determinism requires (see
 * docs/research/phase3-colyseus-input-prediction-api.md).
 */
export class IntervalTickDriver implements TickDriver {
  readonly #room: Pick<Room, "setFixedTimestep">;
  readonly #tickRateHz: number;

  constructor(room: Pick<Room, "setFixedTimestep">, tickRateHz: number) {
    this.#room = room;
    this.#tickRateHz = tickRateHz;
  }

  start(callback: TickCallback): void {
    this.#room.setFixedTimestep(
      (ctx) => callback({ dt: ctx.dt, tick: ctx.tick }),
      this.#tickRateHz,
    );
  }

  stop(): void {}
}

export class ManualTickDriver implements TickDriver {
  #callback: TickCallback | undefined;
  #tick = 0;

  start(callback: TickCallback): void {
    this.#callback = callback;
  }

  stop(): void {
    this.#callback = undefined;
  }

  step(times = 1, dt = 1 / 60): void {
    for (let i = 0; i < times; i++) {
      this.#tick += 1;
      this.#callback?.({ dt, tick: this.#tick });
    }
  }
}
