import type { ArenaDefinition } from "@castle-clash/shared";
import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { UNITS_PER_ART_PX, renderBackground, renderTerrain } from "../viewmodel/arenaRaster.js";
import { themeFor } from "../viewmodel/arenaThemes.js";
import { rasterTexture, type WorldAtlas } from "./WorldAtlas.js";

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
 * rects show until it lands, and stay if it rejects.
 */
export class ArenaView {
  readonly #container: Container;
  readonly #atlas: Promise<WorldAtlas | null>;
  #placeholder: Graphics | null = null;
  #art: Container | null = null;
  #textures: Texture[] = [];
  /** Bumped by every `setArena`/`destroy`, so an atlas that lands late paints only for the arena
   *  that asked for it. */
  #generation = 0;

  constructor(container: Container, atlas: Promise<WorldAtlas | null> = Promise.resolve(null)) {
    this.#container = container;
    this.#atlas = atlas;
  }

  setArena(arena: ArenaDefinition): void {
    this.#clear();
    const generation = ++this.#generation;
    this.#placeholder = drawPlaceholder(arena);
    this.#container.addChild(this.#placeholder);
    void this.#atlas.then((atlas) => {
      if (atlas && generation === this.#generation) {
        this.#drawArt(arena, atlas);
      }
    });
  }

  #drawArt(arena: ArenaDefinition, atlas: WorldAtlas): void {
    const theme = themeFor(arena.id);
    const background = rasterTexture(renderBackground(arena, theme, atlas.sprite));
    const terrain = rasterTexture(renderTerrain(arena, theme, atlas.sprite));
    const art = new Container();
    for (const texture of [background, terrain]) {
      const sprite = new Sprite(texture);
      sprite.position.set(arena.bounds.x, arena.bounds.y);
      sprite.scale.set(UNITS_PER_ART_PX);
      art.addChild(sprite);
    }
    this.#textures = [background, terrain];
    this.#art = art;
    this.#placeholder?.destroy();
    this.#placeholder = null;
    this.#container.addChild(art);
  }

  #clear(): void {
    this.#placeholder?.destroy();
    this.#placeholder = null;
    this.#art?.destroy({ children: true });
    this.#art = null;
    for (const texture of this.#textures) {
      texture.destroy(true);
    }
    this.#textures = [];
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
