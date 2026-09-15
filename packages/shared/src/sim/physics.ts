import { GRAVITY, MAX_FALL_SPEED } from "../config/game.js";
import type { AABB } from "../math/aabb.js";
import type { Vec } from "../math/vec.js";

export function applyGravity(vel: Vec, dt: number): Vec {
  return { x: vel.x, y: Math.min(vel.y + GRAVITY * dt, MAX_FALL_SPEED) };
}

export interface SweepResult {
  pos: Vec;
  vel: Vec;
  grounded: boolean;
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && aMax > bMin;
}

/**
 * Swept collision along one axis: instead of moving the box then checking
 * whether the FINAL position overlaps an obstacle (which lets a fast-enough
 * move jump clean over a thin obstacle), this finds whether the box's
 * leading edge crosses the obstacle's near edge anywhere along the move —
 * independent of the obstacle's thickness, so it can't tunnel. Also doubles
 * as the one-way-platform test: "collide only when moving in the positive
 * direction and starting above the obstacle" is exactly the crossing check
 * for `delta > 0`, so callers implement one-way platforms simply by omitting
 * them from `obstacles` when `delta <= 0`.
 */
function sweepAxis(
  start: number,
  size: number,
  delta: number,
  perpMin: number,
  perpMax: number,
  obstacles: readonly AABB[],
  perpMinOf: (o: AABB) => number,
  perpMaxOf: (o: AABB) => number,
  axisMinOf: (o: AABB) => number,
  axisMaxOf: (o: AABB) => number,
): { pos: number; delta: number; hit: boolean } {
  let bestPos = start + delta;
  let bestDelta = delta;
  let hit = false;

  if (delta === 0) {
    return { pos: bestPos, delta: bestDelta, hit };
  }

  for (const obstacle of obstacles) {
    if (!rangesOverlap(perpMin, perpMax, perpMinOf(obstacle), perpMaxOf(obstacle))) {
      continue;
    }

    if (delta > 0) {
      const leadStart = start + size;
      const leadEnd = start + size + delta;
      const edge = axisMinOf(obstacle);
      if (leadStart <= edge && leadEnd >= edge) {
        const contact = edge - size;
        if (contact < bestPos) {
          bestPos = contact;
          bestDelta = contact - start;
          hit = true;
        }
      }
    } else {
      const leadStart = start;
      const leadEnd = start + delta;
      const edge = axisMaxOf(obstacle);
      if (leadStart >= edge && leadEnd <= edge) {
        const contact = edge;
        if (contact > bestPos) {
          bestPos = contact;
          bestDelta = contact - start;
          hit = true;
        }
      }
    }
  }

  return { pos: bestPos, delta: bestDelta, hit };
}

export function sweep(
  box: AABB,
  vel: Vec,
  dt: number,
  solids: readonly AABB[],
  platforms: readonly AABB[],
): SweepResult {
  const dx = vel.x * dt;
  const xResult = sweepAxis(
    box.x,
    box.w,
    dx,
    box.y,
    box.y + box.h,
    solids,
    (o) => o.y,
    (o) => o.y + o.h,
    (o) => o.x,
    (o) => o.x + o.w,
  );
  const newX = xResult.pos;
  const velX = xResult.hit ? 0 : vel.x;

  const dy = vel.y * dt;
  const yObstacles = dy > 0 ? [...solids, ...platforms] : solids;
  const yResult = sweepAxis(
    box.y,
    box.h,
    dy,
    newX,
    newX + box.w,
    yObstacles,
    (o) => o.x,
    (o) => o.x + o.w,
    (o) => o.y,
    (o) => o.y + o.h,
  );
  const newY = yResult.pos;
  const velY = yResult.hit ? 0 : vel.y;
  const grounded = yResult.hit && dy >= 0;

  return { pos: { x: newX, y: newY }, vel: { x: velX, y: velY }, grounded };
}
