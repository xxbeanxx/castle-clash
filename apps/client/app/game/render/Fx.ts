import { Container, Sprite, Texture } from "pixi.js";
import { UNITS_PER_ART_PX } from "../viewmodel/arenaRaster.js";
import {
  ambientFx,
  actorOf,
  makeParticles,
  makeRng,
  stepParticle,
  type FxSpawn,
  type Particle,
} from "../viewmodel/fx.js";
import type { KnightRect } from "../viewmodel/playersToRects.js";

/** More than a busy four-player fight ever has alive at once; past it, new particles are dropped. */
export const FX_CAPACITY = 384;

/** Particles are flat squares that shrink to nothing in their last fraction of life. */
const FADE_FRACTION = 0.4;

/**
 * Hit sparks, block sparks, guard-break bursts, KO poofs, dust and roll trails (plan 15.4 step 13).
 * A fixed pool of sprites is created once and reused, so a hit allocates no display objects. The
 * sprites share Pixi's white texture and take their colour by tint, so a particle is one tiny
 * quad and costs the GPU almost nothing (see ADR 0004 on why screen-covering art does not go
 * through Pixi). Positions snap to whole art pixels, like everything else in the scene.
 *
 * Effects are visual only. Hitstop, which the plan lists here, is not implemented: the sim never
 * pauses (ADR 0001), and freezing the sprites would need per-knight animation clocks.
 */
export class Fx {
  readonly #sprites: Sprite[] = [];
  readonly #live: (Particle | null)[] = [];
  readonly #rng = makeRng(0x0c1a5);
  readonly #ambientClocks = new Map<string, number>();
  #cursor = 0;

  constructor(container: Container, capacity = FX_CAPACITY) {
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.visible = false;
      container.addChild(sprite);
      this.#sprites.push(sprite);
      this.#live.push(null);
    }
  }

  /** How many particles are alive right now. */
  get active(): number {
    return this.#live.reduce((n, p) => n + (p ? 1 : 0), 0);
  }

  spawn(spawns: readonly FxSpawn[]): void {
    for (const spawn of spawns) {
      for (const particle of makeParticles(spawn, this.#rng)) {
        const slot = this.#freeSlot();
        if (slot < 0) {
          return;
        }
        this.#live[slot] = particle;
        this.#draw(slot, particle);
      }
    }
  }

  /** Dust behind a running knight and a trail behind a rolling one, from what each is doing. */
  ambient(rects: readonly KnightRect[], dtMs: number): void {
    this.spawn(
      ambientFx(
        rects.map((rect) => ({ id: rect.id, action: rect.action, actor: actorOf(rect) })),
        dtMs,
        this.#ambientClocks,
      ),
    );
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = 0; i < this.#live.length; i++) {
      const particle = this.#live[i];
      if (!particle) {
        continue;
      }
      if (stepParticle(particle, dt)) {
        this.#draw(i, particle);
      } else {
        this.#live[i] = null;
        this.#sprites[i]!.visible = false;
      }
    }
  }

  #freeSlot(): number {
    const n = this.#live.length;
    for (let i = 0; i < n; i++) {
      const slot = (this.#cursor + i) % n;
      if (!this.#live[slot]) {
        this.#cursor = (slot + 1) % n;
        return slot;
      }
    }
    return -1;
  }

  #draw(slot: number, p: Particle): void {
    const sprite = this.#sprites[slot]!;
    // Shrink through the last part of life: a 2 px particle becomes 1 px, then goes.
    const remaining = p.life / p.maxLife;
    const size = remaining < FADE_FRACTION && p.size > 1 ? p.size - 1 : p.size;
    sprite.visible = true;
    sprite.tint = p.color;
    sprite.width = size * UNITS_PER_ART_PX;
    sprite.height = size * UNITS_PER_ART_PX;
    sprite.position.set(snap(p.x), snap(p.y));
  }

  destroy(): void {
    this.#ambientClocks.clear();
    for (const sprite of this.#sprites) {
      sprite.destroy();
    }
    this.#sprites.length = 0;
    this.#live.length = 0;
  }
}

/** Nearest even world unit, i.e. a whole art pixel. */
function snap(v: number): number {
  return Math.round(v / UNITS_PER_ART_PX) * UNITS_PER_ART_PX;
}
