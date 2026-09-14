import { type Container, Sprite, Texture } from "pixi.js";
import type { PlayerRect } from "../viewmodel/playersToRects.js";

const PLAYER_SIZE = 32;

export class PlayerRectsView {
  readonly #container: Container;
  readonly #spritesById = new Map<string, Sprite>();

  constructor(container: Container) {
    this.#container = container;
  }

  sync(rects: readonly PlayerRect[]): void {
    const seen = new Set<string>();

    for (const rect of rects) {
      seen.add(rect.id);
      const sprite = this.#spriteFor(rect.id);
      sprite.tint = rect.tint;
      sprite.position.set(rect.x, rect.y);
    }

    for (const [id, sprite] of this.#spritesById) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.#spritesById.delete(id);
      }
    }
  }

  #spriteFor(id: string): Sprite {
    const existing = this.#spritesById.get(id);
    if (existing) {
      return existing;
    }
    const sprite = new Sprite(Texture.WHITE);
    sprite.width = PLAYER_SIZE;
    sprite.height = PLAYER_SIZE;
    this.#container.addChild(sprite);
    this.#spritesById.set(id, sprite);
    return sprite;
  }
}
