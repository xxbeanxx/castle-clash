import { PLAYER_HEIGHT, PLAYER_WIDTH, TICK_RATE } from "@castle-clash/shared";
import { type Container, Sprite, type Texture } from "pixi.js";
import { knightPose } from "../viewmodel/knightAnimation.js";
import type { KnightRect } from "../viewmodel/playersToRects.js";
import type { KnightAtlas } from "./KnightAtlas.js";

/** World units per art pixel (ADR 0002). Sprites are authored on the art grid, so they are drawn
 *  at this scale and positioned on even world units, which is a whole art pixel. */
const WORLD_PER_ART_PX = 2;
const TICK_MS = 1000 / TICK_RATE;
/** Server patches arrive every `TICK_RATE / PATCH_RATE` = 3 ticks; extrapolating further than
 *  this means patches have stalled, and the animation holds instead of running away. */
const MAX_EXTRAPOLATED_TICKS = 6;

interface Feedback {
  tint: number;
  alpha: number;
}

const NEUTRAL: Feedback = { tint: 0xffffff, alpha: 1 };

/** Combat-state cues layered over the art. The pack has no block, block-stun or guard-broken
 *  frames (they reuse crouch and hit), so the tint is what tells those apart. */
function feedback(action: string): Feedback {
  switch (action) {
    case "HitStun":
      return { tint: 0xff9a9a, alpha: 1 };
    case "GuardBroken":
      return { tint: 0xffc47a, alpha: 1 };
    case "Block":
    case "BlockStun":
      return { tint: 0x9ab8ff, alpha: 1 };
    case "Dodge":
      return { tint: 0xffffff, alpha: 0.55 };
    default:
      return NEUTRAL;
  }
}

interface KnightSprite {
  sprite: Sprite;
  texture: Texture | null;
  action: string;
  rawTick: number;
  baseTick: number;
  sinceMs: number;
  tick: number;
}

/**
 * Draws each player as the animated knight (Phase 15). Same shape as `PlayerRectsView.sync`, plus
 * the frame time so a remote player's animation can advance between server patches.
 *
 * The sprite's feet sit on the hitbox's bottom edge, its body column on the hitbox's centre, and
 * the art extends above and beside the hitbox (`docs/art/BIBLE.md`); the hitbox stays the truth
 * for combat.
 */
export class KnightView {
  readonly #container: Container;
  readonly #atlas: KnightAtlas;
  readonly #players = new Map<string, KnightSprite>();

  constructor(container: Container, atlas: KnightAtlas) {
    this.#container = container;
    this.#atlas = atlas;
  }

  sync(rects: readonly KnightRect[], dtMs: number): void {
    const seen = new Set<string>();
    const { pivot, frameSize } = this.#atlas.data.meta;

    for (const rect of rects) {
      seen.add(rect.id);
      let knight = this.#players.get(rect.id);
      if (!knight) {
        const sprite = new Sprite();
        sprite.anchor.set(pivot.x / frameSize.w, pivot.y / frameSize.h);
        this.#container.addChild(sprite);
        knight = {
          sprite,
          texture: null,
          action: "",
          rawTick: -1,
          baseTick: 0,
          sinceMs: 0,
          tick: 0,
        };
        this.#players.set(rect.id, knight);
      }

      const actionChanged = rect.action !== knight.action;
      if (actionChanged || rect.actionTick !== knight.rawTick) {
        knight.baseTick = rect.actionTick;
        knight.sinceMs = 0;
      } else {
        knight.sinceMs += dtMs;
      }
      const extra = Math.min(Math.floor(knight.sinceMs / TICK_MS), MAX_EXTRAPOLATED_TICKS);
      const tick = knight.baseTick + extra;
      // Within one action the animation only moves forward, so a patch that lands a tick behind
      // the local extrapolation does not step the frame back.
      knight.tick = actionChanged ? tick : Math.max(knight.tick, tick);
      knight.action = rect.action;
      knight.rawTick = rect.actionTick;

      const pose = knightPose({
        action: rect.action,
        actionTick: knight.tick,
        weapon: rect.weapon,
        attackKind: rect.attackKind,
        vy: rect.vy,
      });
      const texture = this.#atlas.texturesFor(rect.tint)[pose.clip]?.[pose.frame];
      if (texture && texture !== knight.texture) {
        knight.sprite.texture = texture;
        knight.texture = texture;
      }

      const { tint, alpha } = feedback(rect.action);
      knight.sprite.tint = tint;
      knight.sprite.alpha = alpha;
      knight.sprite.scale.set(WORLD_PER_ART_PX * rect.facing, WORLD_PER_ART_PX);
      knight.sprite.position.set(snap(rect.x + PLAYER_WIDTH / 2), snap(rect.y + PLAYER_HEIGHT));
    }

    for (const [id, knight] of this.#players) {
      if (!seen.has(id)) {
        knight.sprite.destroy();
        this.#players.delete(id);
      }
    }
  }
}

/** Nearest whole art pixel, in world units. */
function snap(worldUnits: number): number {
  return Math.round(worldUnits / WORLD_PER_ART_PX) * WORLD_PER_ART_PX;
}
