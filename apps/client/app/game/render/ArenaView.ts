import type { ArenaDefinition } from "@castle-clash/shared";
import { Container, Graphics } from "pixi.js";
import { renderBackground, renderTerrain } from "../viewmodel/arenaRaster.js";
import { overlay } from "../viewmodel/raster.js";
import { themeFor } from "../viewmodel/arenaThemes.js";
import { Backdrop } from "./Backdrop.js";
import type { StageTransform, SurfaceLayout } from "./surface.js";
import type { WorldAtlas } from "./WorldAtlas.js";

/** The flat-colour arena drawn before the art arrives, and kept if the art fails to load. */
const SOLID_COLOR = 0x3a3a3a;
const PLATFORM_COLOR = 0x6b5a3a;
const KILL_ZONE_COLOR = 0x220000;

/**
 * Draws one arena's static geometry once per match (plan Phase 6 step 5's `ArenaView`), never
 * redrawn per tick: none of it changes shape mid-match (only `HazardState` does, which `HazardView`
 * owns).
 *
 * With the world atlas, the arena is painted from `ArenaDefinition` itself: `renderTerrain` tiles
 * a fill over the union of the solids and outlines its exposed edges, so the picture is derived from
 * the geometry that collides and cannot disagree with it. The atlas is a promise, never awaited by
 * `GameClient.start()` (its message handlers must be registered the moment the join resolves): flat
 * rects show until it lands, and stay if it rejects. The picture itself is a DOM canvas behind the
 * Pixi canvas (`Backdrop`), not a Pixi sprite; see there for why.
 */
export class ArenaView {
  readonly #container: Container;
  readonly #atlas: Promise<WorldAtlas | null>;
  readonly #host: HTMLElement | null;
  #placeholder: Graphics | null = null;
  #backdrop: Backdrop | null = null;
  #last: { stage: StageTransform; layout: SurfaceLayout } | null = null;
  /** Bumped by every `setArena`/`destroy`, so an atlas that lands late paints only for the arena
   *  that asked for it. */
  #generation = 0;

  /** `host` is the element holding the Pixi canvas; without one (a test) there is no art. */
  constructor(
    container: Container,
    atlas: Promise<WorldAtlas | null> = Promise.resolve(null),
    host: HTMLElement | null = null,
  ) {
    this.#container = container;
    this.#atlas = atlas;
    this.#host = host;
  }

  setArena(arena: ArenaDefinition): void {
    this.#clear();
    const generation = ++this.#generation;
    this.#placeholder = drawPlaceholder(arena);
    this.#container.addChild(this.#placeholder);
    void this.#atlas.then((atlas) => {
      if (atlas && this.#host && generation === this.#generation) {
        this.#drawArt(arena, atlas, this.#host);
      }
    });
  }

  /** Follows the stage transform (`GameClient.#updateCamera`), so shake moves the art with the knights. */
  place(stage: StageTransform, layout: SurfaceLayout): void {
    this.#last = { stage, layout };
    this.#backdrop?.place(stage, layout);
  }

  #drawArt(arena: ArenaDefinition, atlas: WorldAtlas, host: HTMLElement): void {
    const theme = themeFor(arena.id);
    const scene = renderBackground(arena, theme, atlas.sprite);
    overlay(scene, renderTerrain(arena, theme, atlas.sprite));
    this.#backdrop = new Backdrop(host, scene, arena.bounds);
    if (this.#last) {
      this.#backdrop.place(this.#last.stage, this.#last.layout);
    }
    this.#placeholder?.destroy();
    this.#placeholder = null;
  }

  #clear(): void {
    this.#placeholder?.destroy();
    this.#placeholder = null;
    this.#backdrop?.destroy();
    this.#backdrop = null;
  }

  destroy(): void {
    this.#generation++;
    this.#clear();
  }
}

function drawPlaceholder(arena: ArenaDefinition): Graphics {
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
  return g;
}
