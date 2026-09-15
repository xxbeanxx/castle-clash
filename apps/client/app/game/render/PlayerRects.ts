import { type Container, Sprite, Texture } from "pixi.js";
import type { PlayerRect } from "../viewmodel/playersToRects.js";

const PLAYER_SIZE = 32;

/** Placeholder combat feedback until real knight sprites/animations exist
 *  (Phase 4 has no art assets in this repo yet — see
 *  docs/research/phase4-knight-rendering-deviation.md): overrides the
 *  player's base tint and alpha by `ActionState`, so a hit, a block, and an
 *  active dodge's invulnerability all read visually without any art. */
function actionOverride(action: string, baseTint: number): { tint: number; alpha: number } {
  switch (action) {
    case "HitStun":
      return { tint: 0xff4444, alpha: 1 };
    case "GuardBroken":
      return { tint: 0xff8800, alpha: 1 };
    case "Block":
      return { tint: 0x4488ff, alpha: 1 };
    case "BlockStun":
      return { tint: 0x2255aa, alpha: 1 };
    case "AttackActive":
      return { tint: 0xffffff, alpha: 1 };
    case "Dodge":
      return { tint: baseTint, alpha: 0.4 };
    case "Dead":
      return { tint: 0x555555, alpha: 0.3 };
    default:
      return { tint: baseTint, alpha: 1 };
  }
}

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
      const { tint, alpha } = actionOverride(rect.action, rect.tint);
      sprite.tint = tint;
      sprite.alpha = alpha;
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
