import type { AABB } from "@castle-clash/shared";
import { placeArena, type StageTransform, type SurfaceLayout } from "./surface.js";

const SHAKE_DECAY_PER_SECOND = 8;
/** Peak shake at intensity 1, in art pixels (the old 14 world units, on the 2-unit grid). */
const SHAKE_MAGNITUDE_ART_PX = 7;

/**
 * The camera after ADR 0002: the whole arena is always on screen, so it no longer follows players
 * or zooms. What is left is centering (`placeArena`) and a decaying shake, both in whole art
 * pixels. `GameClient` decides which `SimEvent`s trigger a shake; this class only renders an
 * impulse once told to. `random` is injectable so the shake is testable.
 */
export class Camera {
  #shakeIntensity = 0;
  readonly #bounds: AABB;
  readonly #random: () => number;

  constructor(bounds: AABB, random: () => number = Math.random) {
    this.#bounds = bounds;
    this.#random = random;
  }

  /** Triggers (or refreshes, if already shaking harder) a decaying shake impulse; `intensity` is a
   *  `0..1`-ish multiplier on the peak. */
  shake(intensity = 1): void {
    this.#shakeIntensity = Math.max(this.#shakeIntensity, intensity);
  }

  /** Advances the shake decay by `dtSeconds`; call once per fixed-step tick. */
  update(dtSeconds: number): void {
    this.#shakeIntensity = Math.max(0, this.#shakeIntensity - SHAKE_DECAY_PER_SECOND * dtSeconds);
  }

  /** The stage transform for the current shake, sampled once per rendered frame. */
  transform(layout: SurfaceLayout): StageTransform {
    if (this.#shakeIntensity <= 0) {
      return placeArena(layout, this.#bounds);
    }
    const magnitude = this.#shakeIntensity * SHAKE_MAGNITUDE_ART_PX;
    return placeArena(layout, this.#bounds, {
      x: Math.round((this.#random() - 0.5) * magnitude),
      y: Math.round((this.#random() - 0.5) * magnitude),
    });
  }
}
