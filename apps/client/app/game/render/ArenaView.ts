import type { ArenaDefinition } from "@castle-clash/shared";
import { Container, Graphics } from "pixi.js";

/** Placeholder arena rendering until real art assets exist (no art assets
 *  in this repo yet, same deviation Phase 4 already documented for knight
 *  rendering — see docs/research/phase4-knight-rendering-deviation.md):
 *  solids, one-way platforms, and the static blast-zone geometry each get
 *  their own flat tint. Hazard-authored geometry (fire zones, breakable
 *  floors, ...) is drawn separately by `HazardView`, since it needs to
 *  react to synced `HazardState`, not just the arena's static definition. */
const SOLID_COLOR = 0x3a3a3a;
const PLATFORM_COLOR = 0x6b5a3a;
const KILL_ZONE_COLOR = 0x220000;

/**
 * Draws one arena's static geometry once per match (plan Phase 6 step 5's
 * `ArenaView`) — never redrawn per tick, since none of this changes shape
 * mid-match (only `HazardState`'s dynamic fields do, which `HazardView`
 * owns). `Loaded during Countdown with a progress UI` from the plan's
 * prose assumes real asset bundles; with flat-color `Graphics` there's
 * nothing to await, so there's no loading state to show.
 */
export class ArenaView {
  readonly #container: Container;
  #graphics: Graphics | null = null;

  constructor(container: Container) {
    this.#container = container;
  }

  setArena(arena: ArenaDefinition): void {
    this.#graphics?.destroy();
    const g = new Graphics();
    for (const box of arena.killZones) {
      g.rect(box.x, box.y, box.w, box.h).fill({ color: KILL_ZONE_COLOR, alpha: 0.5 });
    }
    for (const box of arena.solids) {
      g.rect(box.x, box.y, box.w, box.h).fill(SOLID_COLOR);
    }
    for (const box of arena.platforms) {
      g.rect(box.x, box.y, box.w, box.h).fill(PLATFORM_COLOR);
    }
    this.#container.addChild(g);
    this.#graphics = g;
  }

  destroy(): void {
    this.#graphics?.destroy();
    this.#graphics = null;
  }
}
