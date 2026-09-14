import type { Vec } from "./vec.js";

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function penetration(a: AABB, b: AABB): Vec | null {
  if (!overlaps(a, b)) {
    return null;
  }

  const overlapLeft = b.x + b.w - a.x;
  const overlapRight = a.x + a.w - b.x;
  const overlapTop = b.y + b.h - a.y;
  const overlapBottom = a.y + a.h - b.y;

  const overlapX = Math.min(overlapLeft, overlapRight);
  const overlapY = Math.min(overlapTop, overlapBottom);

  if (overlapX < overlapY) {
    return { x: overlapRight < overlapLeft ? -overlapX : overlapX, y: 0 };
  }
  return { x: 0, y: overlapBottom < overlapTop ? -overlapY : overlapY };
}
