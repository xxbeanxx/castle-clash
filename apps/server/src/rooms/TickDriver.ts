import type { Room } from "colyseus";

export type TickCallback = (deltaMs: number) => void;

export interface TickDriver {
  start(callback: TickCallback): void;
  stop(): void;
}

/**
 * `setTimestep` schedules its own callback internally, tied to the room's
 * lifecycle — matches `TickDriver.stop()`'s job with nothing left to do.
 */
export class IntervalTickDriver implements TickDriver {
  readonly #room: Pick<Room, "setTimestep">;
  readonly #tickRateHz: number;

  constructor(room: Pick<Room, "setTimestep">, tickRateHz: number) {
    this.#room = room;
    this.#tickRateHz = tickRateHz;
  }

  start(callback: TickCallback): void {
    this.#room.setTimestep(callback, 1000 / this.#tickRateHz);
  }

  stop(): void {}
}

export class ManualTickDriver implements TickDriver {
  #callback: TickCallback | undefined;

  start(callback: TickCallback): void {
    this.#callback = callback;
  }

  stop(): void {
    this.#callback = undefined;
  }

  step(times = 1, deltaMs = 0): void {
    for (let i = 0; i < times; i++) {
      this.#callback?.(deltaMs);
    }
  }
}
