import {
  Interpolator as SharedInterpolator,
  type InterpolatorOptions,
  type Vec,
} from "@castle-clash/shared";

interface PositionedSnapshot {
  x: number;
  y: number;
}

/**
 * Wires the shared, framework-free `Interpolator` to a remote player's
 * `PlayerState` schema entry: `pushFromSchema` is the only client-specific
 * bit, reading `x`/`y` off the decoded schema instance at a given estimated
 * server time.
 */
export class Interpolator {
  readonly #core: SharedInterpolator;

  constructor(options?: InterpolatorOptions) {
    this.#core = new SharedInterpolator(options);
  }

  pushFromSchema(schema: PositionedSnapshot, serverTimeMs: number): void {
    this.#core.push({ serverTime: serverTimeMs, pos: { x: schema.x, y: schema.y } });
  }

  positionAt(serverTimeMs: number): Vec | undefined {
    return this.#core.positionAt(serverTimeMs);
  }
}
