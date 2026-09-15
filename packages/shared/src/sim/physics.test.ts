import { describe, expect, it } from "vitest";
import type { AABB } from "../math/aabb.js";
import { applyGravity, sweep } from "./physics.js";

const FLOOR: AABB = { x: 0, y: 400, w: 800, h: 40 };
const LEFT_WALL: AABB = { x: 0, y: 0, w: 20, h: 800 };
const RIGHT_WALL: AABB = { x: 780, y: 0, w: 20, h: 800 };
const PLATFORM: AABB = { x: 300, y: 300, w: 200, h: 20 };

const PLAYER: AABB = { x: 100, y: 350, w: 28, h: 48 };

describe("applyGravity", () => {
  it("accelerates downward and clamps at terminal velocity", () => {
    const v1 = applyGravity({ x: 0, y: 0 }, 1 / 60);
    expect(v1.y).toBeGreaterThan(0);

    const v2 = applyGravity({ x: 0, y: 100000 }, 1 / 60);
    expect(v2.y).toBeLessThanOrEqual(1400);
  });

  it("leaves horizontal velocity untouched", () => {
    const v = applyGravity({ x: 123, y: 0 }, 1 / 60);
    expect(v.x).toBe(123);
  });
});

describe("sweep — solids", () => {
  it("lands on a solid floor and reports grounded", () => {
    const result = sweep(PLAYER, { x: 0, y: 500 }, 1 / 60, [FLOOR], []);
    expect(result.grounded).toBe(true);
    expect(result.pos.y).toBe(FLOOR.y - PLAYER.h);
    expect(result.vel.y).toBe(0);
  });

  it("never tunnels through a thin solid at very high velocity", () => {
    const thinFloor: AABB = { x: 0, y: 400, w: 800, h: 2 };
    const fastVel = { x: 0, y: 50000 };
    const result = sweep(PLAYER, fastVel, 1 / 60, [thinFloor], []);
    expect(result.grounded).toBe(true);
    expect(result.pos.y).toBe(thinFloor.y - PLAYER.h);
  });

  it("stops horizontal movement against a wall", () => {
    const nearWall: AABB = { x: 30, y: 350, w: 28, h: 48 };
    const result = sweep(nearWall, { x: -50000, y: 0 }, 1 / 60, [LEFT_WALL, FLOOR], []);
    expect(result.vel.x).toBe(0);
    expect(result.pos.x).toBe(LEFT_WALL.x + LEFT_WALL.w);
  });

  it("stops rightward movement against a wall", () => {
    const nearWall: AABB = { x: 700, y: 350, w: 28, h: 48 };
    const result = sweep(nearWall, { x: 50000, y: 0 }, 1 / 60, [RIGHT_WALL, FLOOR], []);
    expect(result.vel.x).toBe(0);
    expect(result.pos.x).toBe(RIGHT_WALL.x - nearWall.w);
  });
});

describe("sweep — one-way platforms", () => {
  it("passes up through a one-way platform from below", () => {
    const below: AABB = { x: 350, y: 340, w: 28, h: 48 };
    const result = sweep(below, { x: 0, y: -3000 }, 1 / 60, [], [PLATFORM]);
    expect(result.grounded).toBe(false);
    expect(result.pos.y).toBeLessThan(PLATFORM.y);
  });

  it("lands on a one-way platform from above while falling", () => {
    const above: AABB = { x: 350, y: 250, w: 28, h: 48 };
    const result = sweep(above, { x: 0, y: 400 }, 1 / 60, [], [PLATFORM]);
    expect(result.grounded).toBe(true);
    expect(result.pos.y).toBe(PLATFORM.y - above.h);
  });

  it("does not collide with a one-way platform already overlapped from the side/below", () => {
    const insideFromBelow: AABB = { x: 350, y: 305, w: 28, h: 48 };
    const result = sweep(insideFromBelow, { x: 0, y: 400 }, 1 / 60, [], [PLATFORM]);
    expect(result.grounded).toBe(false);
  });
});
