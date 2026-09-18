import { type Container, Sprite, Texture } from "pixi.js";
import type { PlayerRect } from "../viewmodel/playersToRects.js";

const PLAYER_SIZE = 32;
/** Small enough to read as a cosmetic accent rather than obscuring the body
 *  rect underneath (plan Phase 9 step 3: helmet/cape visible to all
 *  players) — see `docs/research/phase9-cosmetics-rendering-deviation.md`
 *  for why this is an indicator rect, not real knight-art sprite layers. */
const COSMETIC_INDICATOR_SIZE = 10;
/** Both sprites use `anchor.set(0.5)` (center-based), unlike the body
 *  sprite's default top-left anchor — offsets below are relative to the
 *  body's top-left corner (`rect.x`/`rect.y`), not its center. */
const HELMET_OFFSET_X = PLAYER_SIZE / 2;
const HELMET_OFFSET_Y = -COSMETIC_INDICATOR_SIZE / 2 - 2;
const CAPE_OFFSET_X = -COSMETIC_INDICATOR_SIZE / 2 - 2;
const CAPE_OFFSET_Y = PLAYER_SIZE / 2;

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

/** A cosmetic slot's indicator sprite, keyed separately from the body
 *  sprite so equipping/unequipping mid-match can add or remove just that
 *  one sprite without touching the body's own sprite/tint/alpha state. */
type CosmeticSlotKey = "helmet" | "cape";

export class PlayerRectsView {
  readonly #container: Container;
  readonly #spritesById = new Map<string, Sprite>();
  readonly #cosmeticSpritesById = new Map<string, Partial<Record<CosmeticSlotKey, Sprite>>>();

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
      this.#syncCosmetic(
        rect.id,
        "helmet",
        rect.helmetTint,
        rect.x + HELMET_OFFSET_X,
        rect.y + HELMET_OFFSET_Y,
      );
      this.#syncCosmetic(
        rect.id,
        "cape",
        rect.capeTint,
        rect.x + CAPE_OFFSET_X,
        rect.y + CAPE_OFFSET_Y,
      );
    }

    for (const [id, sprite] of this.#spritesById) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.#spritesById.delete(id);
        this.#destroyCosmetics(id);
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

  /** `tint === undefined` means "this slot's equipped item has no visible
   *  render" (the slot's `default` item, or an id `getCosmeticTint`
   *  doesn't recognize) — the indicator sprite for that slot is destroyed
   *  rather than left invisible, so `sync([])`'s destroy-on-absence
   *  contract for the body sprite has one clear counterpart per slot. */
  #syncCosmetic(
    id: string,
    slot: CosmeticSlotKey,
    tint: number | undefined,
    x: number,
    y: number,
  ): void {
    const slots = this.#cosmeticSpritesById.get(id) ?? {};
    const existing = slots[slot];

    if (tint === undefined) {
      if (existing) {
        existing.destroy();
        delete slots[slot];
        this.#cosmeticSpritesById.set(id, slots);
      }
      return;
    }

    const sprite = existing ?? new Sprite(Texture.WHITE);
    if (!existing) {
      sprite.width = COSMETIC_INDICATOR_SIZE;
      sprite.height = COSMETIC_INDICATOR_SIZE;
      sprite.anchor.set(0.5);
      this.#container.addChild(sprite);
      slots[slot] = sprite;
      this.#cosmeticSpritesById.set(id, slots);
    }
    sprite.tint = tint;
    sprite.position.set(x, y);
  }

  #destroyCosmetics(id: string): void {
    const slots = this.#cosmeticSpritesById.get(id);
    if (!slots) {
      return;
    }
    for (const sprite of Object.values(slots)) {
      sprite?.destroy();
    }
    this.#cosmeticSpritesById.delete(id);
  }
}
