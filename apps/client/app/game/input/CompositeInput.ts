import type { InputSource } from "./InputSource.js";

/** ORs any number of `InputSource`s into one, so a hybrid device can use keyboard, touch, and
 *  gamepad at once. Every source is sampled every time (no short-circuit): each one clears its own
 *  tap latch on `sample()`. */
export class CompositeInput implements InputSource {
  readonly #sources: readonly InputSource[];

  constructor(sources: readonly InputSource[]) {
    this.#sources = sources;
  }

  attach(): void {
    for (const source of this.#sources) {
      source.attach();
    }
  }

  detach(): void {
    for (const source of this.#sources) {
      source.detach();
    }
  }

  sample(): number {
    let bits = 0;
    for (const source of this.#sources) {
      bits |= source.sample();
    }
    return bits;
  }
}
