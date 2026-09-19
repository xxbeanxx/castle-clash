/**
 * A plain fixed-window counter, keyed by an arbitrary string — extracted
 * from `MatchRoom`'s original per-connection message throttling (Phase 4)
 * so plan Phase 10 step 1's join-rate-limit-per-IP/-user guardrails (`index.
 * ts`'s `beforeUpgrade` handler, `MatchRoom.onJoin`) can reuse the exact
 * same windowing logic instead of a second copy of it.
 */
const PRUNE_THRESHOLD = 10_000;

export class FixedWindowRateLimiter {
  readonly #windows = new Map<string, { windowStartMs: number; count: number }>();
  readonly #limit: number;
  readonly #windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** Returns `true` and counts this call against `key`'s current window if
   *  under the limit; `false` (and does NOT count it) once the window's
   *  budget is exhausted. `now` is a parameter (not `Date.now()` read
   *  internally) so a test can drive it deterministically. */
  consume(key: string, now: number = Date.now()): boolean {
    if (this.#windows.size >= PRUNE_THRESHOLD) {
      this.#pruneExpired(now);
    }
    const window = this.#windows.get(key);

    if (!window || now - window.windowStartMs >= this.#windowMs) {
      this.#windows.set(key, { windowStartMs: now, count: 1 });
      return true;
    }

    if (window.count >= this.#limit) {
      return false;
    }

    window.count += 1;
    return true;
  }

  delete(key: string): void {
    this.#windows.delete(key);
  }

  /** The per-IP/per-user limiters are keyed by attacker-controlled values and
   *  live for the whole process — without this, a flood of distinct keys
   *  grows the map forever. An expired window is indistinguishable from no
   *  entry at all (`consume` restarts it), so dropping them is lossless. */
  #pruneExpired(now: number): void {
    for (const [key, window] of this.#windows) {
      if (now - window.windowStartMs >= this.#windowMs) {
        this.#windows.delete(key);
      }
    }
  }

  get size(): number {
    return this.#windows.size;
  }
}
