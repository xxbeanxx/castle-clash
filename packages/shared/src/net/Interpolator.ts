import type { Vec } from "../math/vec.js";

export interface Snapshot {
  /** Server clock time in ms this snapshot was authoritative at. */
  serverTime: number;
  pos: Vec;
}

export interface InterpolatorOptions {
  /** How far in the past to render remote entities, in ms. Default 100. */
  delayMs?: number;
  /** Max snapshots retained; oldest drops first. Default 32. */
  bufferSize?: number;
}

/**
 * Passive smoothing for a remote entity: buffers snapshots by server time and
 * renders at `serverTime - delayMs`, lerping between the two bracketing
 * snapshots. Holds the last known value when the buffer runs dry — it never
 * extrapolates forward, per the plan's netcode spec.
 */
export class Interpolator {
  #snapshots: Snapshot[] = [];
  readonly #delayMs: number;
  readonly #bufferSize: number;

  constructor(options: InterpolatorOptions = {}) {
    this.#delayMs = options.delayMs ?? 100;
    this.#bufferSize = options.bufferSize ?? 32;
  }

  push(snapshot: Snapshot): void {
    this.#snapshots.push(snapshot);
    this.#snapshots.sort((a, b) => a.serverTime - b.serverTime);
    if (this.#snapshots.length > this.#bufferSize) {
      this.#snapshots.splice(0, this.#snapshots.length - this.#bufferSize);
    }
  }

  positionAt(serverTime: number): Vec | undefined {
    if (this.#snapshots.length === 0) {
      return undefined;
    }

    const renderTime = serverTime - this.#delayMs;
    let before: Snapshot | undefined;
    let after: Snapshot | undefined;

    for (const snapshot of this.#snapshots) {
      if (snapshot.serverTime <= renderTime) {
        before = snapshot;
      } else {
        after = snapshot;
        break;
      }
    }

    if (before && after) {
      const span = after.serverTime - before.serverTime;
      const t = span === 0 ? 0 : (renderTime - before.serverTime) / span;
      return {
        x: before.pos.x + (after.pos.x - before.pos.x) * t,
        y: before.pos.y + (after.pos.y - before.pos.y) * t,
      };
    }

    // No `before` (renderTime is behind everything buffered) holds the
    // earliest known value; no `after` (buffer ran dry) holds the latest —
    // either way, hold, never extrapolate.
    return (before ?? this.#snapshots[0]!).pos;
  }
}
