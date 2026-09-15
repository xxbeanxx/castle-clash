import {
  COYOTE_TICKS,
  JUMP_BUFFER_TICKS,
  JUMP_VELOCITY,
  MAX_RUN_SPEED,
  MOVE_ACCEL,
  MOVE_FRICTION,
  SHORT_HOP_MULTIPLIER,
} from "../config/game.js";
import { has } from "../input/bitmask.js";
import type { Vec } from "../math/vec.js";
import type { SimPlayer } from "./types.js";

export function applyHorizontalMovement(vel: Vec, bits: number, dt: number): Vec {
  const dir = (has(bits, "RIGHT") ? 1 : 0) - (has(bits, "LEFT") ? 1 : 0);

  if (dir !== 0) {
    const vx = Math.max(-MAX_RUN_SPEED, Math.min(MAX_RUN_SPEED, vel.x + dir * MOVE_ACCEL * dt));
    return { x: vx, y: vel.y };
  }

  if (vel.x === 0) {
    return vel;
  }

  const sign = Math.sign(vel.x);
  const decayed = vel.x - sign * MOVE_FRICTION * dt;
  return { x: Math.sign(decayed) === sign ? decayed : 0, y: vel.y };
}

export function updateFacing(current: 1 | -1, bits: number): 1 | -1 {
  const left = has(bits, "LEFT");
  const right = has(bits, "RIGHT");
  if (right && !left) {
    return 1;
  }
  if (left && !right) {
    return -1;
  }
  return current;
}

export interface JumpCounters {
  coyoteTicks: number;
  jumpBufferTicks: number;
}

export function updateJumpCounters(
  player: SimPlayer,
  bits: number,
  wasGrounded: boolean,
): JumpCounters {
  return {
    coyoteTicks: wasGrounded ? COYOTE_TICKS : Math.max(0, player.coyoteTicks - 1),
    jumpBufferTicks: has(bits, "JUMP")
      ? JUMP_BUFFER_TICKS
      : Math.max(0, player.jumpBufferTicks - 1),
  };
}

export interface JumpAttempt extends JumpCounters {
  vel: Vec;
  jumped: boolean;
}

export function tryJump(vel: Vec, coyoteTicks: number, jumpBufferTicks: number): JumpAttempt {
  if (coyoteTicks > 0 && jumpBufferTicks > 0) {
    return {
      vel: { x: vel.x, y: -JUMP_VELOCITY },
      jumped: true,
      coyoteTicks: 0,
      jumpBufferTicks: 0,
    };
  }
  return { vel, jumped: false, coyoteTicks, jumpBufferTicks };
}

/** Releasing JUMP while still ascending cuts the upward velocity, shortening
 *  the jump arc — reapplied every tick the button stays up, so once cut it
 *  stays cut even if JUMP is pressed again mid-arc. */
export function applyVariableJumpHeight(vel: Vec, bits: number): Vec {
  if (vel.y < 0 && !has(bits, "JUMP")) {
    return { x: vel.x, y: vel.y * SHORT_HOP_MULTIPLIER };
  }
  return vel;
}

export function shouldDropThrough(bits: number): boolean {
  return has(bits, "DOWN") && has(bits, "JUMP");
}
