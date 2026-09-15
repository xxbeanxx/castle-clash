import { DROP_THROUGH_TICKS, PLAYER_HEIGHT, PLAYER_WIDTH, TICK_RATE } from "../config/game.js";
import type { InputFrame } from "../input/bitmask.js";
import type { PlayerId } from "../types/ids.js";
import { applyGravity, sweep } from "./physics.js";
import {
  applyHorizontalMovement,
  applyVariableJumpHeight,
  shouldDropThrough,
  tryJump,
  updateFacing,
  updateJumpCounters,
} from "./movement.js";
import type { SimPlayer, SimState } from "./types.js";

const DT = 1 / TICK_RATE;

export interface SimEvent {
  type: "jump" | "land";
  playerId: PlayerId;
}

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}

/**
 * Pure per-tick step: no I/O, no wall-clock reads, no randomness beyond
 * `state.rngSeed` (ADR 0001). Runs identically on server and client, so both
 * sides agree on a jump or a landing given the same state and inputs.
 */
export function step(
  state: SimState,
  inputs: Readonly<Partial<Record<PlayerId, InputFrame>>>,
): StepResult {
  const events: SimEvent[] = [];
  const players: Record<PlayerId, SimPlayer> = {};

  for (const id of Object.keys(state.players) as PlayerId[]) {
    const prev = state.players[id]!;
    const input = inputs[id];
    const bits = input?.bits ?? 0;
    const wasGrounded = prev.grounded;

    const { coyoteTicks: coyoteAfterGround, jumpBufferTicks: bufferAfterInput } =
      updateJumpCounters(prev, bits, wasGrounded);
    let coyoteTicks = coyoteAfterGround;
    let jumpBufferTicks = bufferAfterInput;

    let vel = applyHorizontalMovement(prev.vel, bits, DT);
    const facing = updateFacing(prev.facing, bits);
    vel = applyGravity(vel, DT);

    let dropThroughTicks = Math.max(0, prev.dropThroughTicks - 1);

    if (wasGrounded && shouldDropThrough(bits)) {
      dropThroughTicks = DROP_THROUGH_TICKS;
    } else {
      const attempt = tryJump(vel, coyoteTicks, jumpBufferTicks);
      vel = attempt.vel;
      coyoteTicks = attempt.coyoteTicks;
      jumpBufferTicks = attempt.jumpBufferTicks;
      if (attempt.jumped) {
        events.push({ type: "jump", playerId: id });
      }
    }

    vel = applyVariableJumpHeight(vel, bits);

    const box = { x: prev.pos.x, y: prev.pos.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
    const platforms = dropThroughTicks > 0 ? [] : state.arena.platforms;
    const swept = sweep(box, vel, DT, state.arena.solids, platforms);

    if (swept.grounded && !wasGrounded) {
      events.push({ type: "land", playerId: id });
    }

    players[id] = {
      pos: swept.pos,
      vel: swept.vel,
      facing,
      grounded: swept.grounded,
      coyoteTicks,
      jumpBufferTicks,
      dropThroughTicks,
      lastInputSeq: input?.seq ?? prev.lastInputSeq,
    };
  }

  return {
    state: { tick: state.tick + 1, players, arena: state.arena, rngSeed: state.rngSeed },
    events,
  };
}
