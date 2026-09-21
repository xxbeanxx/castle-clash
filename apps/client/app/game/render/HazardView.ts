import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { UNITS_PER_ART_PX } from "../viewmodel/arenaRaster.js";
import { themeFor, type ArenaTheme } from "../viewmodel/arenaThemes.js";
import { hazardVisual, paintHazard } from "../viewmodel/hazardRaster.js";
import type { HazardRect } from "../viewmodel/hazardsToRects.js";
import { rasterTexture, type WorldAtlas } from "./WorldAtlas.js";

/** The flat-colour hazards drawn before the art arrives, and kept if the art fails to load: one
 *  rect per hazard, coloured by kind and dimmed once inactive (broken/fallen). */
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

/** One hazard drawn from art: a sprite whose texture is swapped per visual state, the images built
 *  lazily and kept for the match (a hazard has a handful of states, and fire four frames). */
interface ArtEntry {
  sprite: Sprite;
  textures: Map<string, Texture>;
  /** `phase`/`active` last seen, and when it changed, for the fall and the warn blink. */
  stateKey: string;
  since: number;
}

/**
 * Animates warn/active/broken states from synced `HazardState` (plan Phase 6 step 5's
 * `HazardView`), redrawn each `sync()` since a hazard's look changes tick to tick.
 *
 * Art comes from the world atlas (a promise, never awaited by `GameClient.start()`): flat rects
 * show until it lands, and stay if it rejects. Geometry is always the hazard's own box, so the art
 * cannot drift from what the sim collides with.
 */
export class HazardView {
  readonly #container: Container;
  readonly #graphicsById = new Map<string, Graphics>();
  readonly #artById = new Map<string, ArtEntry>();
  #atlas: WorldAtlas | null = null;
  #theme: ArenaTheme = themeFor("");
  #destroyed = false;

  constructor(container: Container, atlas: Promise<WorldAtlas | null> = Promise.resolve(null)) {
    this.#container = container;
    void atlas.then((loaded) => {
      if (this.#destroyed || !loaded) {
        return;
      }
      this.#atlas = loaded;
      for (const graphics of this.#graphicsById.values()) {
        graphics.destroy();
      }
      this.#graphicsById.clear();
    });
  }

  /** Picks the arena's look (what its breakable blocks are made of). */
  setArena(arenaId: string): void {
    this.#theme = themeFor(arenaId);
    this.#clearArt();
  }

  sync(rects: readonly HazardRect[], nowMs: number = performance.now()): void {
    const seen = new Set<string>();
    for (const rect of rects) {
      seen.add(rect.id);
      if (this.#atlas) {
        this.#syncArt(rect, this.#atlas, nowMs);
      } else {
        this.#syncPlaceholder(rect);
      }
    }
    for (const [id, graphics] of this.#graphicsById) {
      if (!seen.has(id)) {
        graphics.destroy();
        this.#graphicsById.delete(id);
      }
    }
    for (const [id, entry] of this.#artById) {
      if (!seen.has(id)) {
        this.#destroyEntry(entry);
        this.#artById.delete(id);
      }
    }
  }

  #syncPlaceholder(rect: HazardRect): void {
    const graphics = this.#graphicFor(rect.id);
    const { color, alpha } = styleFor(rect);
    graphics.clear();
    graphics.rect(0, 0, rect.w, rect.h).fill(color);
    graphics.alpha = alpha;
    graphics.position.set(rect.x, rect.y);
  }

  #syncArt(rect: HazardRect, atlas: WorldAtlas, nowMs: number): void {
    let entry = this.#artById.get(rect.id);
    if (!entry) {
      const sprite = new Sprite();
      sprite.scale.set(UNITS_PER_ART_PX);
      this.#container.addChild(sprite);
      entry = { sprite, textures: new Map(), stateKey: "", since: nowMs };
      this.#artById.set(rect.id, entry);
    }
    const stateKey = `${rect.phase}/${rect.active}`;
    if (stateKey !== entry.stateKey) {
      entry.stateKey = stateKey;
      entry.since = nowMs;
    }
    const visual = hazardVisual(rect, nowMs, nowMs - entry.since);
    entry.sprite.visible = visual.visible;
    if (!visual.visible) {
      return;
    }
    let texture = entry.textures.get(visual.key);
    if (!texture) {
      const w = Math.round(rect.w / UNITS_PER_ART_PX);
      const h = Math.round(rect.h / UNITS_PER_ART_PX);
      texture = rasterTexture(paintHazard(visual.key, w, h, this.#theme, atlas.sprite));
      entry.textures.set(visual.key, texture);
    }
    entry.sprite.texture = texture;
    entry.sprite.alpha = visual.alpha;
    entry.sprite.position.set(rect.x + visual.dx, rect.y + visual.dy);
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

  #destroyEntry(entry: ArtEntry): void {
    entry.sprite.destroy();
    for (const texture of entry.textures.values()) {
      texture.destroy(true);
    }
  }

  #clearArt(): void {
    for (const entry of this.#artById.values()) {
      this.#destroyEntry(entry);
    }
    this.#artById.clear();
  }

  /** Frees the painted textures (the display objects go with the Pixi `Application`). */
  destroy(): void {
    this.#destroyed = true;
    this.#clearArt();
  }
}
