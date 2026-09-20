/**
 * Rolling frame-time statistics over the last `capacity` frames (plan Phase 13 step 12). Exposed
 * through the `VITE_E2E` debug hook so an emulated run, and a person with a real phone attached to
 * DevTools, can read the same numbers. It measures the raw ticker gap, so a frame that ran long
 * shows up even though the sim itself only ever steps in fixed increments.
 */
export interface FrameSummary {
  frames: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  /** Frames longer than twice the budget, counted over the window. */
  slowFrames: number;
}

export class FrameStats {
  readonly #samples: number[] = [];
  readonly #capacity: number;
  readonly #budgetMs: number;

  constructor(capacity = 240, budgetMs = 1000 / 60) {
    this.#capacity = capacity;
    this.#budgetMs = budgetMs;
  }

  record(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs < 0) {
      return;
    }
    this.#samples.push(frameMs);
    if (this.#samples.length > this.#capacity) {
      this.#samples.shift();
    }
  }

  summary(): FrameSummary | null {
    const n = this.#samples.length;
    if (n === 0) {
      return null;
    }
    const sorted = [...this.#samples].sort((a, b) => a - b);
    const sum = sorted.reduce((total, ms) => total + ms, 0);
    return {
      frames: n,
      meanMs: sum / n,
      p95Ms: sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] ?? 0,
      maxMs: sorted[n - 1] ?? 0,
      slowFrames: sorted.filter((ms) => ms > this.#budgetMs * 2).length,
    };
  }
}
