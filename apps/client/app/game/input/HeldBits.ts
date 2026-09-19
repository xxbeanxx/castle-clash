/**
 * Held-input state for one `InputSource`, with the lost-tap fix (plan Phase 13 step 5, finding F7).
 *
 * A source is sampled once per 60 Hz tick, so a press and release that both land between two
 * samples used to vanish: the bit was never set when `sample()` looked. Every press is therefore
 * latched until the next `sample()`, which reports `held | pressedSinceLastSample` and then clears
 * the latch. A tap costs exactly one tick of input; a held key costs one tick per tick, as before.
 *
 * Presses are keyed by an opaque id (a key code, a pointer id) rather than by bit, because two ids
 * can drive one bit (`ArrowLeft` and `KeyA` are both LEFT) and releasing one must not release the
 * other.
 */
export class HeldBits {
  readonly #held = new Map<string | number, number>();
  #latched = 0;

  press(id: string | number, bits: number): void {
    this.#held.set(id, bits);
    this.#latched |= bits;
  }

  release(id: string | number): void {
    this.#held.delete(id);
  }

  /** Releases everything, including a press not yet sampled. For blur, `pointercancel`, and
   *  `visibilitychange`, where a stuck input is worse than a dropped one. */
  clear(): void {
    this.#held.clear();
    this.#latched = 0;
  }

  sample(): number {
    let bits = this.#latched;
    for (const held of this.#held.values()) {
      bits |= held;
    }
    this.#latched = 0;
    return bits;
  }
}
