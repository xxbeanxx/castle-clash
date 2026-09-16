import { Container, Graphics } from "pixi.js";
import type { HazardRect } from "../viewmodel/hazardsToRects.js";

/** Placeholder hazard rendering until real art exists (same deviation as
 *  `ArenaView`/Phase 4's knight rendering) — one flat-tinted rect per
 *  hazard, colored by kind and dimmed once inactive (broken/fallen). */
const KIND_COLORS: Record<string, number> = {
  fireZone: 0xff6600,
  breakableFloor: 0x8a6a3a,
  killZone: 0x440000,
  timedTrap: 0xd9a400,
  collapsingPlatform: 0x5a8a99,
};

const INACTIVE_COLOR = 0x222222;
const INACTIVE_ALPHA = 0.15;
const ACTIVE_ALPHA = 0.55;
/** `TimedTrap`'s telegraph window reads brighter/more opaque than its
 *  resting color, so the warning is visually distinct before it fires. */
const WARN_ALPHA = 0.85;

function styleFor(rect: HazardRect): { color: number; alpha: number } {
  if (!rect.active) {
    return { color: INACTIVE_COLOR, alpha: INACTIVE_ALPHA };
  }
  const color = KIND_COLORS[rect.kind] ?? 0xffffff;
  return { color, alpha: rect.phase === "warn" ? WARN_ALPHA : ACTIVE_ALPHA };
}

/**
 * Animates warn/active/broken states from synced `HazardState` (plan
 * Phase 6 step 5's `HazardView`) — one `Graphics` rect per hazard id,
 * created lazily and redrawn each `sync()` call (unlike `ArenaView`'s
 * static geometry, a hazard's color genuinely changes tick to tick).
 */
export class HazardView {
  readonly #container: Container;
  readonly #graphicsById = new Map<string, Graphics>();

  constructor(container: Container) {
    this.#container = container;
  }

  sync(rects: readonly HazardRect[]): void {
    const seen = new Set<string>();

    for (const rect of rects) {
      seen.add(rect.id);
      const graphics = this.#graphicFor(rect.id);
      const { color, alpha } = styleFor(rect);
      graphics.clear();
      graphics.rect(0, 0, rect.w, rect.h).fill(color);
      graphics.alpha = alpha;
      graphics.position.set(rect.x, rect.y);
    }

    for (const [id, graphics] of this.#graphicsById) {
      if (!seen.has(id)) {
        graphics.destroy();
        this.#graphicsById.delete(id);
      }
    }
  }

  #graphicFor(id: string): Graphics {
    const existing = this.#graphicsById.get(id);
    if (existing) {
      return existing;
    }
    const graphics = new Graphics();
    this.#container.addChild(graphics);
    this.#graphicsById.set(id, graphics);
    return graphics;
  }
}
