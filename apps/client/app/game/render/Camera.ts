import type { AABB, Vec } from "@castle-clash/shared";

export interface CameraFrame {
  x: number;
  y: number;
  zoom: number;
}

export interface CameraConfig {
  viewportWidth: number;
  viewportHeight: number;
  minZoom: number;
  maxZoom: number;
  /** Extra world-space margin kept around the tightest bounding box of
   *  living players, so nobody sits pinned to the very edge of the frame. */
  padding: number;
}

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  viewportWidth: 1280,
  viewportHeight: 720,
  minZoom: 0.5,
  maxZoom: 1,
  padding: 160,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Clamps a camera axis so the viewport stays within `[min, min + size]` —
 *  when the viewport is wider than the arena along this axis (`lo > hi`),
 *  there's nothing to clamp against, so the arena is centered instead of
 *  pinned to one edge. */
function clampAxis(center: number, halfViewport: number, min: number, size: number): number {
  const lo = min + halfViewport;
  const hi = min + size - halfViewport;
  return lo > hi ? min + size / 2 : clamp(center, lo, hi);
}

/**
 * Pure framing math (plan Phase 6 step 5's `Camera`): given living
 * players' positions, computes the single target frame — center and
 * clamped zoom — that fits them all right now. Lerping toward that target
 * and shaking on events are the stateful `CameraController` below's job,
 * which is what `GameClient` actually drives every tick; kept separate so
 * the math itself stays trivially testable (`Camera.test.ts`) without
 * needing a fake clock.
 *
 * No living players (everyone just got eliminated mid-round, or hasn't
 * spawned yet) centers on the arena as a whole, zoomed all the way in
 * (`maxZoom`) — there's nothing to fit, so this just avoids showing a
 * degenerate/undefined frame.
 */
export function frameCamera(
  positions: readonly Vec[],
  bounds: AABB,
  config: CameraConfig = DEFAULT_CAMERA_CONFIG,
): CameraFrame {
  if (positions.length === 0) {
    return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, zoom: config.maxZoom };
  }

  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = Math.max(maxX - minX + config.padding * 2, 1);
  const spanY = Math.max(maxY - minY + config.padding * 2, 1);
  const zoom = clamp(
    Math.min(config.viewportWidth / spanX, config.viewportHeight / spanY),
    config.minZoom,
    config.maxZoom,
  );

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const halfViewW = config.viewportWidth / zoom / 2;
  const halfViewH = config.viewportHeight / zoom / 2;

  return {
    x: clampAxis(centerX, halfViewW, bounds.x, bounds.w),
    y: clampAxis(centerY, halfViewH, bounds.y, bounds.h),
    zoom,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const LERP_RATE_PER_SECOND = 6;
const SHAKE_DECAY_PER_SECOND = 8;
const SHAKE_MAGNITUDE = 14;

/**
 * The stateful half of `Camera` (plan step 5): lerps toward `frameCamera`'s
 * target every tick instead of snapping to it, and layers a decaying random
 * shake on top when `shake()` is called (a hit, a KO, a hazard trap firing
 * — `GameClient` is what decides which `SimEvent`s trigger one, this class
 * only knows how to render an impulse once told to). Not itself unit-tested
 * beyond `frameCamera`'s pure math — the lerp/shake are cosmetic, and
 * exercising them meaningfully needs either a fake clock or the live
 * browser verification this phase's session already does for canvas
 * feedback.
 */
export class CameraController {
  #current: CameraFrame;
  #shakeIntensity = 0;
  readonly #bounds: AABB;
  readonly #config: CameraConfig;

  constructor(bounds: AABB, config: CameraConfig = DEFAULT_CAMERA_CONFIG) {
    this.#bounds = bounds;
    this.#config = config;
    this.#current = frameCamera([], bounds, config);
  }

  get frame(): CameraFrame {
    if (this.#shakeIntensity <= 0) {
      return this.#current;
    }
    const magnitude = this.#shakeIntensity * SHAKE_MAGNITUDE;
    return {
      x: this.#current.x + (Math.random() - 0.5) * magnitude,
      y: this.#current.y + (Math.random() - 0.5) * magnitude,
      zoom: this.#current.zoom,
    };
  }

  /** Triggers (or refreshes, if already shaking harder) a decaying shake
   *  impulse — `intensity` is a `0..1`-ish multiplier on `SHAKE_MAGNITUDE`. */
  shake(intensity = 1): void {
    this.#shakeIntensity = Math.max(this.#shakeIntensity, intensity);
  }

  /** Advances the lerp/shake by `dtSeconds` toward `frameCamera`'s target
   *  for `livingPositions` — call once per fixed-step tick. */
  update(livingPositions: readonly Vec[], dtSeconds: number): void {
    const target = frameCamera(livingPositions, this.#bounds, this.#config);
    const t = 1 - Math.exp(-LERP_RATE_PER_SECOND * dtSeconds);
    this.#current = {
      x: lerp(this.#current.x, target.x, t),
      y: lerp(this.#current.y, target.y, t),
      zoom: lerp(this.#current.zoom, target.zoom, t),
    };
    this.#shakeIntensity = Math.max(0, this.#shakeIntensity - SHAKE_DECAY_PER_SECOND * dtSeconds);
  }
}
