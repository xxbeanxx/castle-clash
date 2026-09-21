import { PLAYER_HEIGHT, PLAYER_WIDTH, type AABB } from "@castle-clash/shared";
import { Container, Sprite, type Texture } from "pixi.js";
import { UNITS_PER_ART_PX } from "../viewmodel/arenaRaster.js";
import { renderGroundMarker, renderNamePlate, renderYouArrow } from "../viewmodel/markers.js";
import type { KnightRect } from "../viewmodel/playersToRects.js";
import { rasterTexture } from "./WorldAtlas.js";

/** From a knight's hitbox top to the top of its sprite (the 38 px pack knight stands on the hitbox's
 *  bottom edge and is taller than the 24 px hitbox), in world units. The plate floats above that. */
const SPRITE_ABOVE_HITBOX = 28;
const PLATE_GAP = 6;
const ARROW_GAP = 2;
/** The local player's plate floats one text row higher than everyone else's (7 art px: a 5 px glyph and
 *  its outline, plus 1), so in a duel, where the two knights stand close, the plates do not overprint. */
const LOCAL_PLATE_LIFT = 7 * UNITS_PER_ART_PX;

/** One player's markers: a coloured bar under their feet, their name above their head, and for the
 *  local player an arrow over the name. Textures are rebuilt only when the name, colour or "is this
 *  me" changes. */
interface Entry {
  key: string;
  ground: Sprite;
  plate: Sprite;
  arrow: Sprite | null;
  textures: Texture[];
}

/**
 * Name plates and ground markers (plan 15.2 step 9): two knights with the same colour or similar
 * silhouettes stay distinguishable, and the local player can always find themselves. Drawn as pixel
 * sprites from `viewmodel/markers.ts`, so they are exact pixels at any scale. A dead knight's
 * markers are hidden.
 */
export class PlayerMarkers {
  readonly #ground: Container;
  readonly #plates: Container;
  readonly #entries = new Map<string, Entry>();

  /** `ground` is drawn under the knights, `plates` over them. */
  constructor(ground: Container, plates: Container) {
    this.#ground = ground;
    this.#plates = plates;
  }

  /** `bounds` (the arena's, world units) keeps a plate from hanging off the edge of the screen when a
   *  knight stands against a wall; the ground bar stays under the feet. */
  sync(rects: readonly KnightRect[], bounds?: AABB): void {
    const seen = new Set<string>();
    for (const rect of rects) {
      seen.add(rect.id);
      const key = `${rect.name}|${rect.tint}|${rect.isLocal}`;
      let entry = this.#entries.get(rect.id);
      if (!entry || entry.key !== key) {
        if (entry) {
          this.#destroyEntry(entry);
        }
        entry = this.#build(key, rect);
        this.#entries.set(rect.id, entry);
      }
      const visible = rect.action !== "Dead";
      const centerX = rect.x + PLAYER_WIDTH / 2;
      const feetY = rect.y + PLAYER_HEIGHT;
      entry.ground.visible = visible;
      entry.ground.position.set(snap(centerX), snap(feetY) + UNITS_PER_ART_PX);
      const plateY = snap(
        rect.y - SPRITE_ABOVE_HITBOX - PLATE_GAP - (rect.isLocal ? LOCAL_PLATE_LIFT : 0),
      );
      const plateX = bounds ? clampInside(centerX, entry.plate.width / 2, bounds) : centerX;
      entry.plate.visible = visible;
      entry.plate.position.set(snap(plateX), plateY);
      if (entry.arrow) {
        entry.arrow.visible = visible;
        entry.arrow.position.set(
          snap(centerX),
          plateY - entry.plate.height - ARROW_GAP * UNITS_PER_ART_PX,
        );
      }
    }
    for (const [id, entry] of this.#entries) {
      if (!seen.has(id)) {
        this.#destroyEntry(entry);
        this.#entries.delete(id);
      }
    }
  }

  #build(key: string, rect: KnightRect): Entry {
    const make = (
      raster: ReturnType<typeof renderNamePlate>,
      anchorY: number,
    ): [Sprite, Texture] => {
      const texture = rasterTexture(raster);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, anchorY);
      sprite.scale.set(UNITS_PER_ART_PX);
      return [sprite, texture];
    };
    const [ground, groundTexture] = make(renderGroundMarker(rect.tint, rect.isLocal), 0);
    const [plate, plateTexture] = make(renderNamePlate(rect.name, rect.tint), 1);
    this.#ground.addChild(ground);
    this.#plates.addChild(plate);
    const textures = [groundTexture, plateTexture];
    let arrow: Sprite | null = null;
    if (rect.isLocal) {
      const [sprite, texture] = make(renderYouArrow(rect.tint), 1);
      this.#plates.addChild(sprite);
      arrow = sprite;
      textures.push(texture);
    }
    return { key, ground, plate, arrow, textures };
  }

  #destroyEntry(entry: Entry): void {
    entry.ground.destroy();
    entry.plate.destroy();
    entry.arrow?.destroy();
    for (const texture of entry.textures) {
      texture.destroy(true);
    }
  }

  /** Frees the painted textures (the display objects go with the Pixi `Application`). */
  destroy(): void {
    for (const entry of this.#entries.values()) {
      this.#destroyEntry(entry);
    }
    this.#entries.clear();
  }
}

/** `x` moved, if need be, so a `half`-wide thing centred on it stays inside `bounds` horizontally. */
function clampInside(x: number, half: number, bounds: AABB): number {
  return Math.min(bounds.x + bounds.w - half, Math.max(bounds.x + half, x));
}

/** Nearest even world unit, i.e. a whole art pixel. */
function snap(v: number): number {
  return Math.round(v / UNITS_PER_ART_PX) * UNITS_PER_ART_PX;
}
