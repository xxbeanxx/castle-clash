import type { ArenaRuntime } from "../arenas/types.js";
import type { Vec } from "../math/vec.js";
import type { PlayerId } from "../types/ids.js";

export interface SimPlayer {
  pos: Vec;
  vel: Vec;
  facing: 1 | -1;
  grounded: boolean;
  coyoteTicks: number;
  jumpBufferTicks: number;
  /** Ticks remaining where one-way platform collision is suppressed, set by a
   *  DOWN+JUMP drop-through. Not part of the plan's headline `SimPlayer`
   *  fields, but drop-through can't work without persisting it across ticks. */
  dropThroughTicks: number;
  lastInputSeq: number;
}

export interface SimState {
  tick: number;
  players: Record<PlayerId, SimPlayer>;
  arena: ArenaRuntime;
  /** The only allowed source of randomness in the sim (ADR 0001) — unused
   *  until a later phase's hazards/power-ups need it, but part of the state
   *  hash now so determinism tests cover it from the start. */
  rngSeed: number;
}

export function createSimPlayer(pos: Vec): SimPlayer {
  return {
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    facing: 1,
    grounded: false,
    coyoteTicks: 0,
    jumpBufferTicks: 0,
    dropThroughTicks: 0,
    lastInputSeq: 0,
  };
}
