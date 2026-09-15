import { describe, expect, it } from "vitest";
import { COYOTE_TICKS, JUMP_BUFFER_TICKS, MAX_RUN_SPEED } from "../config/game.js";
import { encode } from "../input/bitmask.js";
import {
  applyHorizontalMovement,
  applyVariableJumpHeight,
  shouldDropThrough,
  tryJump,
  updateFacing,
  updateJumpCounters,
} from "./movement.js";
import { createSimPlayer } from "./types.js";

const DT = 1 / 60;
const NONE = 0;
const RIGHT = encode(["RIGHT"]);
const LEFT = encode(["LEFT"]);
const JUMP = encode(["JUMP"]);
const DOWN_JUMP = encode(["DOWN", "JUMP"]);

describe("applyHorizontalMovement", () => {
  it("accelerates toward max run speed while held", () => {
    let vel = { x: 0, y: 0 };
    for (let i = 0; i < 60; i++) {
      vel = applyHorizontalMovement(vel, RIGHT, DT);
    }
    expect(vel.x).toBeCloseTo(MAX_RUN_SPEED, 0);
  });

  it("decelerates to a stop via friction once input is released", () => {
    let vel = { x: MAX_RUN_SPEED, y: 0 };
    for (let i = 0; i < 60; i++) {
      vel = applyHorizontalMovement(vel, NONE, DT);
    }
    expect(vel.x).toBe(0);
  });

  it("moves left with LEFT held", () => {
    let vel = { x: 0, y: 0 };
    for (let i = 0; i < 60; i++) {
      vel = applyHorizontalMovement(vel, LEFT, DT);
    }
    expect(vel.x).toBeCloseTo(-MAX_RUN_SPEED, 0);
  });
});

describe("updateFacing", () => {
  it("faces right on RIGHT, left on LEFT, and holds on neither", () => {
    expect(updateFacing(1, RIGHT)).toBe(1);
    expect(updateFacing(1, LEFT)).toBe(-1);
    expect(updateFacing(-1, NONE)).toBe(-1);
  });
});

describe("coyote time and jump buffering", () => {
  it("allows a jump inside the coyote window after leaving the ground", () => {
    const player = createSimPlayer({ x: 0, y: 0 });
    player.coyoteTicks = 2;
    const counters = updateJumpCounters(player, JUMP, false);
    const result = tryJump({ x: 0, y: 0 }, counters.coyoteTicks, counters.jumpBufferTicks);
    expect(result.jumped).toBe(true);
  });

  it("rejects a jump once the coyote window has fully expired", () => {
    const player = createSimPlayer({ x: 0, y: 0 });
    player.coyoteTicks = 0;
    const counters = updateJumpCounters(player, JUMP, false);
    const result = tryJump({ x: 0, y: 0 }, counters.coyoteTicks, counters.jumpBufferTicks);
    expect(result.jumped).toBe(false);
  });

  it("fires a jump buffered before landing, on the landing tick", () => {
    const player = createSimPlayer({ x: 0, y: 0 });
    player.jumpBufferTicks = JUMP_BUFFER_TICKS - 5;
    const counters = updateJumpCounters(player, NONE, true);
    const result = tryJump({ x: 0, y: 0 }, counters.coyoteTicks, counters.jumpBufferTicks);
    expect(result.jumped).toBe(true);
  });

  it("does not buffer a jump forever — it expires after JUMP_BUFFER_TICKS", () => {
    const player = createSimPlayer({ x: 0, y: 0 });
    player.jumpBufferTicks = 0;
    let grounded = false;
    for (let i = 0; i < JUMP_BUFFER_TICKS + 1; i++) {
      const counters = updateJumpCounters(player, i === 0 ? JUMP : NONE, grounded);
      player.jumpBufferTicks = counters.jumpBufferTicks;
      player.coyoteTicks = counters.coyoteTicks;
      grounded = false;
    }
    const result = tryJump({ x: 0, y: 0 }, player.coyoteTicks, player.jumpBufferTicks);
    expect(result.jumped).toBe(false);
  });

  it("resets coyote to the full window while grounded", () => {
    const player = createSimPlayer({ x: 0, y: 0 });
    player.coyoteTicks = 0;
    const counters = updateJumpCounters(player, NONE, true);
    expect(counters.coyoteTicks).toBe(COYOTE_TICKS);
  });
});

describe("variable jump height", () => {
  it("cuts upward velocity when JUMP is released mid-ascent", () => {
    const cut = applyVariableJumpHeight({ x: 0, y: -800 }, NONE);
    expect(cut.y).toBeLessThan(0);
    expect(cut.y).toBeGreaterThan(-800);
  });

  it("leaves velocity untouched while JUMP is still held", () => {
    const held = applyVariableJumpHeight({ x: 0, y: -800 }, JUMP);
    expect(held.y).toBe(-800);
  });

  it("does not affect downward velocity", () => {
    const falling = applyVariableJumpHeight({ x: 0, y: 800 }, NONE);
    expect(falling.y).toBe(800);
  });

  it("produces a short-hop apex lower than a full-jump apex", () => {
    const simulateApex = (bits: number): number => {
      let vel = { x: 0, y: -820 };
      let apex = 0;
      let y = 0;
      for (let i = 0; i < 120 && vel.y < 0; i++) {
        vel = applyVariableJumpHeight(vel, i === 0 ? JUMP : bits);
        vel = { x: vel.x, y: vel.y + 2200 * DT };
        y += vel.y * DT;
        apex = Math.min(apex, y);
      }
      return apex;
    };

    const fullJumpApex = simulateApex(JUMP);
    const shortHopApex = simulateApex(NONE);
    expect(Math.abs(shortHopApex)).toBeLessThan(Math.abs(fullJumpApex));
  });
});

describe("shouldDropThrough", () => {
  it("is true only when DOWN and JUMP are both held", () => {
    expect(shouldDropThrough(DOWN_JUMP)).toBe(true);
    expect(shouldDropThrough(JUMP)).toBe(false);
    expect(shouldDropThrough(NONE)).toBe(false);
  });
});
