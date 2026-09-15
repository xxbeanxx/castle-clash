import type { InputFrame } from "../input/bitmask.js";
import { step } from "../sim/GameSimulation.js";
import type { SimEvent } from "../sim/GameSimulation.js";
import type { SimState } from "../sim/types.js";
import type { PlayerId } from "../types/ids.js";

export type TickInputs = Readonly<Partial<Record<PlayerId, InputFrame>>>;

/** Runs `GameSimulation.step` for N ticks against scripted per-tick inputs — no
 *  network, no server, no client: the baseline other layers' output is
 *  compared against in tests. */
export class SimHarness {
  #state: SimState;
  #events: SimEvent[] = [];

  constructor(initialState: SimState) {
    this.#state = initialState;
  }

  get state(): SimState {
    return this.#state;
  }

  get events(): readonly SimEvent[] {
    return this.#events;
  }

  runTick(inputs: TickInputs = {}): SimState {
    const result = step(this.#state, inputs);
    this.#state = result.state;
    this.#events.push(...result.events);
    return this.#state;
  }

  runTicks(inputsPerTick: readonly TickInputs[]): SimState {
    for (const inputs of inputsPerTick) {
      this.runTick(inputs);
    }
    return this.#state;
  }
}
