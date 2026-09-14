export interface Vec {
  x: number;
  y: number;
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec, s: number): Vec {
  return { x: v.x * s, y: v.y * s };
}

export function length(v: Vec): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}
