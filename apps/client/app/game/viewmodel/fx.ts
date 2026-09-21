import { PLAYER_HEIGHT, PLAYER_WIDTH, type SimEvent } from "@castle-clash/shared";
import type { KnightRect } from "./playersToRects.js";

/**
 * Effects as particle bursts (plan 15.4 step 13). Everything here is pure: an event and where things
 * are go in, particles come out, and `stepParticle` advances one. `render/Fx.ts` owns the pooled
 * sprites. Effects are visual only and never feed back into the sim (ADR 0001): they are spawned
 * from the server's `fx` broadcast and from what a knight is visibly doing, so a missed or late
 * event costs a spark, never a desync.
 */
export type FxKind =
  | "hit"
  | "block"
  | "guardBreak"
  | "ko"
  | "jumpDust"
  | "landDust"
  | "runDust"
  | "dodge"
  | "debris"
  | "armor";

/** A place an effect happens, in world units, with the way it should fly (`dir`: 1 right, -1 left). */
export interface FxSpawn {
  kind: FxKind;
  x: number;
  y: number;
  dir: 1 | -1;
}

/** One pixel-art particle: a `size` x `size` art-pixel square that flies and fades. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** World units per second squared, down. */
  gravity: number;
  /** Fraction of horizontal speed lost per second. */
  drag: number;
  life: number;
  maxLife: number;
  /** Art pixels along a side. */
  size: number;
  color: number;
}

interface BurstSpec {
  count: number;
  /** World units per second. */
  speed: readonly [number, number];
  /** Radians either side of the burst direction (Math.PI: all round). */
  spread: number;
  /** Extra upward speed, so dust and sparks lift a little. */
  lift: number;
  gravity: number;
  drag: number;
  /** Seconds. */
  life: readonly [number, number];
  sizes: readonly number[];
  colors: readonly number[];
}

const BURSTS: Readonly<Record<FxKind, BurstSpec>> = {
  hit: {
    count: 10,
    speed: [180, 380],
    spread: 0.9,
    lift: 60,
    gravity: 900,
    drag: 1.5,
    life: [0.18, 0.34],
    sizes: [1, 1, 2],
    colors: [0xffffff, 0xf7c282, 0xf7c282, 0xeaa56c],
  },
  block: {
    count: 7,
    speed: [120, 260],
    spread: 0.7,
    lift: 40,
    gravity: 700,
    drag: 2,
    life: [0.14, 0.26],
    sizes: [1, 1],
    colors: [0xc0cbdc, 0x8b9bb4, 0xffffff],
  },
  guardBreak: {
    count: 18,
    speed: [160, 460],
    spread: Math.PI,
    lift: 80,
    gravity: 800,
    drag: 1.2,
    life: [0.24, 0.5],
    sizes: [1, 2, 2],
    colors: [0xe84537, 0xf7c282, 0xffffff, 0xe84537],
  },
  ko: {
    count: 20,
    speed: [80, 340],
    spread: Math.PI,
    lift: 120,
    gravity: 600,
    drag: 1.4,
    life: [0.4, 0.8],
    sizes: [2, 2, 1],
    colors: [0xc7c7b0, 0x868273, 0x833c22, 0xe6e6d4],
  },
  jumpDust: {
    count: 4,
    speed: [30, 90],
    spread: 1.2,
    lift: 10,
    gravity: -40,
    drag: 2.5,
    life: [0.2, 0.36],
    sizes: [1, 2],
    colors: [0xa88a64, 0x8a6f52],
  },
  landDust: {
    count: 8,
    speed: [60, 170],
    spread: 0.35,
    lift: 20,
    gravity: -30,
    drag: 3,
    life: [0.22, 0.42],
    sizes: [1, 2],
    colors: [0xa88a64, 0x8a6f52, 0xc9a97e],
  },
  runDust: {
    count: 2,
    speed: [20, 60],
    spread: 0.5,
    lift: 15,
    gravity: -20,
    drag: 3,
    life: [0.16, 0.3],
    sizes: [1],
    colors: [0xa88a64, 0x8a6f52],
  },
  dodge: {
    count: 3,
    speed: [10, 50],
    spread: Math.PI,
    lift: 0,
    gravity: 0,
    drag: 4,
    life: [0.12, 0.24],
    sizes: [2, 1],
    colors: [0xc0cbdc, 0x8b9bb4],
  },
  debris: {
    count: 12,
    speed: [60, 220],
    spread: Math.PI,
    lift: 140,
    gravity: 1000,
    drag: 0.8,
    life: [0.35, 0.7],
    sizes: [2, 1, 2],
    colors: [0xcf8254, 0xbd6c4a, 0x763b36],
  },
  armor: {
    count: 14,
    speed: [120, 300],
    spread: Math.PI,
    lift: 40,
    gravity: 300,
    drag: 1.8,
    life: [0.25, 0.5],
    sizes: [1, 2],
    colors: [0xffffff, 0xc0cbdc, 0x8b9bb4],
  },
};

export const ALL_FX_KINDS = Object.keys(BURSTS) as FxKind[];

/** A small seeded generator (mulberry32) so a burst is a pure function of its inputs. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rng: () => number, [lo, hi]: readonly [number, number]): number {
  return lo + (hi - lo) * rng();
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** The particles of one effect. */
export function makeParticles(spawn: FxSpawn, rng: () => number): Particle[] {
  const spec = BURSTS[spawn.kind];
  const particles: Particle[] = [];
  const base = spawn.dir > 0 ? 0 : Math.PI;
  for (let i = 0; i < spec.count; i++) {
    const angle = base + (rng() * 2 - 1) * spec.spread;
    const speed = between(rng, spec.speed);
    const life = between(rng, spec.life);
    particles.push({
      x: spawn.x,
      y: spawn.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - spec.lift * rng(),
      gravity: spec.gravity,
      drag: spec.drag,
      life,
      maxLife: life,
      size: pick(rng, spec.sizes),
      color: pick(rng, spec.colors),
    });
  }
  return particles;
}

/** Advances a particle by `dt` seconds; false once it has run out of life. */
export function stepParticle(p: Particle, dt: number): boolean {
  p.life -= dt;
  if (p.life <= 0) {
    return false;
  }
  p.vx *= Math.max(0, 1 - p.drag * dt);
  p.vy += p.gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  return true;
}

/** Where a knight is, for aiming an effect: `x` its body centre, `feetY` and `chestY` in world units. */
export interface FxActor {
  x: number;
  feetY: number;
  chestY: number;
  facing: 1 | -1;
}

/** A knight's rect (its hitbox's top-left) as the places effects aim at. */
export function actorOf(rect: Pick<KnightRect, "x" | "y" | "facing">): FxActor {
  return {
    x: rect.x + PLAYER_WIDTH / 2,
    feetY: rect.y + PLAYER_HEIGHT,
    chestY: rect.y + PLAYER_HEIGHT * 0.4,
    facing: rect.facing,
  };
}

export interface FxWorld {
  actor(id: string): FxActor | undefined;
  /** A hazard's centre, in world units. */
  hazardCenter(id: string): { x: number; y: number } | undefined;
}

/**
 * Which effects a batch of `fx` events asks for. Whiffs and eliminations make none (a KO already
 * did, and an elimination by falling has nowhere to burst). An event about a knight or hazard the
 * client cannot place (it just left, or has not arrived) is dropped, not guessed.
 */
export function fxForEvents(events: readonly SimEvent[], world: FxWorld): FxSpawn[] {
  const spawns: FxSpawn[] = [];
  for (const event of events) {
    switch (event.type) {
      case "hit":
      case "blocked":
      case "guardBreak":
      case "ko": {
        const defender = event.defender ? world.actor(event.defender) : undefined;
        if (!defender) {
          break;
        }
        const attacker = world.actor(event.attacker);
        // Sparks fly away from the attacker; with no attacker in view, away from where it faces.
        const dir: 1 | -1 = attacker
          ? defender.x >= attacker.x
            ? 1
            : -1
          : (-defender.facing as 1 | -1);
        const kind = event.type === "blocked" ? "block" : event.type;
        // A block's sparks come off the front of the shield, not the middle of the body.
        const x = kind === "block" ? defender.x - dir * 10 : defender.x;
        spawns.push({ kind, x, y: defender.chestY, dir });
        break;
      }
      case "jump":
      case "land": {
        const actor = world.actor(event.playerId);
        if (actor) {
          spawns.push({
            kind: event.type === "jump" ? "jumpDust" : "landDust",
            x: actor.x,
            y: actor.feetY,
            dir: actor.facing,
          });
        }
        break;
      }
      case "hazardBreak": {
        const at = world.hazardCenter(event.hazardId);
        if (at) {
          spawns.push({ kind: "debris", x: at.x, y: at.y, dir: 1 });
        }
        break;
      }
      case "hazardTrap":
        for (const victim of event.victims) {
          const actor = world.actor(victim);
          if (actor) {
            spawns.push({ kind: "hit", x: actor.x, y: actor.chestY, dir: -actor.facing as 1 | -1 });
          }
        }
        break;
      case "ringOutArmorUsed": {
        const actor = world.actor(event.playerId);
        if (actor) {
          spawns.push({ kind: "armor", x: actor.x, y: actor.feetY, dir: 1 });
        }
        break;
      }
      default:
        break;
    }
  }
  return spawns;
}

/** Milliseconds between the puffs of a running knight's dust, and between a roll's after-images. */
export const RUN_DUST_MS = 140;
export const DODGE_TRAIL_MS = 45;

/**
 * State-driven effects: a running knight kicks up dust and a rolling one leaves a trail. `clocks`
 * holds each knight's countdown to its next puff, and is the only state.
 */
export function ambientFx(
  players: readonly { id: string; action: string; actor: FxActor }[],
  dtMs: number,
  clocks: Map<string, number>,
): FxSpawn[] {
  const spawns: FxSpawn[] = [];
  const seen = new Set<string>();
  for (const { id, action, actor } of players) {
    const isRun = action === "Run";
    const isDodge = action === "Dodge";
    if (!isRun && !isDodge) {
      continue;
    }
    seen.add(id);
    const left = (clocks.get(id) ?? 0) - dtMs;
    if (left > 0) {
      clocks.set(id, left);
      continue;
    }
    clocks.set(id, isRun ? RUN_DUST_MS : DODGE_TRAIL_MS);
    // Dust trails behind the knight; a roll's trail sits at the chest.
    spawns.push(
      isRun
        ? {
            kind: "runDust",
            x: actor.x - actor.facing * 8,
            y: actor.feetY,
            dir: -actor.facing as 1 | -1,
          }
        : { kind: "dodge", x: actor.x, y: actor.chestY, dir: -actor.facing as 1 | -1 },
    );
  }
  for (const id of [...clocks.keys()]) {
    if (!seen.has(id)) {
      clocks.delete(id);
    }
  }
  return spawns;
}
