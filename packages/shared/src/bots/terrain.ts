import { PLAYER_HEIGHT, PLAYER_WIDTH } from "../config/game.js";
import { dynamicPlatforms, dynamicSolids } from "../hazards/step.js";
import { overlaps, type AABB } from "../math/aabb.js";
import type { SimState } from "../sim/types.js";

/** How far a step ahead the bot looks, in world units (a bit under one tick of run speed x 8). */
const STEP_PROBE = 30;
/** How far below the feet a landing still counts as ground rather than a drop into the void. */
const MAX_SAFE_DROP = 420;
/** Widest gap a run-up jump can clear (`JUMP_VELOCITY` airtime at `MAX_RUN_SPEED`, with margin). */
const LEAP_REACH = 210;
const LEAP_STEP = 30;

/** The player-sized box a bot would occupy at `x`, feet where they are now. */
function bodyAt(x: number, y: number): AABB {
  return { x, y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/** Everything that hurts or kills on contact right now, as boxes. Timed traps and lit fire are
 *  treated as always hostile: the bot has no timing sense, so it simply keeps away. */
export function hostileBoxes(sim: SimState): AABB[] {
  const boxes: AABB[] = [...sim.arena.killZones];
  for (const hazard of sim.arena.hazards) {
    if (hazard.kind === "killZone" || hazard.kind === "fireZone" || hazard.kind === "timedTrap") {
      boxes.push(hazard.box);
    }
  }
  return boxes;
}

/** Surfaces a body can stand on this tick: static solids, one-way platforms, and hazard-made ground. */
function groundBoxes(sim: SimState): AABB[] {
  const hazards = sim.hazards ?? {};
  return [
    ...sim.arena.solids,
    ...sim.arena.platforms,
    ...dynamicSolids(sim.arena.hazards, hazards),
    ...dynamicPlatforms(sim.arena.hazards, hazards),
  ];
}

/** Top y of the nearest ground under a body at `x` whose feet are at `feetY`, or `null` for none. */
function groundBelow(ground: readonly AABB[], x: number, feetY: number): number | null {
  let best: number | null = null;
  for (const box of ground) {
    const overlapsX = x < box.x + box.w && x + PLAYER_WIDTH > box.x;
    if (!overlapsX || box.y < feetY - 6 || box.y > feetY + MAX_SAFE_DROP) {
      continue;
    }
    if (best === null || box.y < best) {
      best = box.y;
    }
  }
  return best;
}

/** Whether a body standing at `x` (top-left) with its top at `y` is somewhere the bot will not go. */
function isDangerous(sim: SimState, ground: readonly AABB[], x: number, y: number): boolean {
  const body = bodyAt(x, y);
  const hostile = hostileBoxes(sim);
  if (hostile.some((box) => overlaps(body, box))) {
    return true;
  }
  const landing = groundBelow(ground, x, y + PLAYER_HEIGHT);
  if (landing === null) {
    return true;
  }
  const landed = bodyAt(x, landing - PLAYER_HEIGHT);
  return hostile.some((box) => overlaps(landed, box));
}

export interface Footing {
  /** Stepping one probe ahead in this direction would put the bot in danger. */
  readonly blocked: boolean;
  /** A jump from here would land on safe ground on the far side of whatever is in the way. */
  readonly canLeap: boolean;
}

/**
 * What lies ahead of a grounded body moving `dir` (-1 left, 1 right): whether the next step is
 * safe, and if not, whether a run-up jump can clear it. This is the whole of the bot's terrain
 * sense; it is not a pathfinder, so a gap wider than a jump simply stops it at the edge.
 */
export function footingAhead(sim: SimState, pos: { x: number; y: number }, dir: -1 | 1): Footing {
  const ground = groundBoxes(sim);
  const nextX = pos.x + dir * STEP_PROBE;
  // Already somewhere dangerous (spawned on a trap, mid-fall): no direction is worse than staying.
  if (!isDangerous(sim, ground, nextX, pos.y) || isDangerous(sim, ground, pos.x, pos.y)) {
    return { blocked: false, canLeap: false };
  }
  for (let reach = LEAP_STEP * 2; reach <= LEAP_REACH; reach += LEAP_STEP) {
    const x = pos.x + dir * reach;
    const landing = groundBelow(ground, x, pos.y + PLAYER_HEIGHT);
    if (
      landing !== null &&
      Math.abs(landing - (pos.y + PLAYER_HEIGHT)) <= 24 &&
      !isDangerous(sim, ground, x, landing - PLAYER_HEIGHT)
    ) {
      return { blocked: true, canLeap: true };
    }
  }
  return { blocked: true, canLeap: false };
}

/** Whether the ground directly under a grounded body is a one-way platform it can drop through. */
export function standingOnPlatform(sim: SimState, pos: { x: number; y: number }): boolean {
  const feetY = pos.y + PLAYER_HEIGHT;
  const boxes = [...sim.arena.platforms, ...dynamicPlatforms(sim.arena.hazards, sim.hazards ?? {})];
  return boxes.some(
    (box) => pos.x < box.x + box.w && pos.x + PLAYER_WIDTH > box.x && Math.abs(box.y - feetY) <= 4,
  );
}

/** The most a single jump can rise (`JUMP_VELOCITY` peak is ~152), with margin for a lean and a landing. */
export const MAX_HOP_RISE = 130;

export interface StepStone {
  /** Where to be (x, top-left of the body) to hop onto it: under a one-way platform, beside a solid. */
  readonly aimX: number;
  /** The surface's top y. */
  readonly top: number;
  /** A one-way platform can be jumped up through from anywhere beneath it (`left`..`right`); a
   *  solid cannot, so it is climbed from its side (a hop off the wall). */
  readonly oneWay: boolean;
  readonly left: number;
  readonly right: number;
}

/**
 * The next surface a body should hop onto to work its way up toward a target that is too high for
 * one jump: the highest standable top within a jump of the feet that does not overshoot the
 * target's own level, nearest first among equals. `null` when there is nothing within reach to
 * climb (the bot then simply waits below, which sudden death eventually ends). Not a pathfinder:
 * one step of lookahead, re-chosen every time the bot lands somewhere new.
 */
export function nextStepStone(
  sim: SimState,
  pos: { x: number; y: number },
  targetFeetY: number,
): StepStone | null {
  const hazards = sim.hazards ?? {};
  const boxes: { box: AABB; oneWay: boolean }[] = [
    ...sim.arena.platforms.map((box) => ({ box, oneWay: true })),
    ...dynamicPlatforms(sim.arena.hazards, hazards).map((box) => ({ box, oneWay: true })),
    ...sim.arena.solids.map((box) => ({ box, oneWay: false })),
    ...dynamicSolids(sim.arena.hazards, hazards).map((box) => ({ box, oneWay: false })),
  ];
  const feetY = pos.y + PLAYER_HEIGHT;
  let best: StepStone | null = null;
  let bestScore = Infinity;
  for (const { box, oneWay } of boxes) {
    const rise = feetY - box.y;
    // Wide enough to land on, above us but within a jump, and not higher than where the target stands.
    if (box.w < 40 || rise < 12 || rise > MAX_HOP_RISE || box.y < targetFeetY - 6) {
      continue;
    }
    const left = box.x;
    const right = box.x + box.w - PLAYER_WIDTH;
    let aimX: number;
    if (oneWay) {
      aimX = Math.min(Math.max(pos.x, left), right);
    } else {
      // Stand against whichever side is nearer; a solid's own span is no place to be underneath.
      const leftSide = box.x - PLAYER_WIDTH;
      const rightSide = box.x + box.w;
      aimX = Math.abs(pos.x - leftSide) <= Math.abs(pos.x - rightSide) ? leftSide : rightSide;
    }
    const sideways = Math.abs(aimX - pos.x);
    if (sideways > 420) {
      continue;
    }
    const score = Math.abs(box.y - targetFeetY) * 2 + sideways;
    if (score < bestScore) {
      bestScore = score;
      best = { aimX, top: box.y, oneWay, left, right };
    }
  }
  return best;
}
