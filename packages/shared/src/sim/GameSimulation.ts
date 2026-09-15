import { applyFsm } from "../combat/fsm.js";
import { resolveCombat, type CombatEvent } from "../combat/resolve.js";
import type { ActionState } from "../combat/types.js";
import { getWeapon } from "../combat/weapons.js";
import { DROP_THROUGH_TICKS, MAX_STAMINA, PLAYER_HEIGHT, PLAYER_WIDTH, TICK_RATE } from "../config/game.js";
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

export type SimEvent = { type: "jump" | "land"; playerId: PlayerId } | CombatEvent;

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}

/** States that lock out movement/jump input — everything except the
 *  neutral, freely-controllable states (Idle/Run/Airborne). Dodge is
 *  deliberately in-place (no dash) for Phase 4's MVP — only its i-frame
 *  timing is spec'd by the plan, not a dash displacement. */
const LOCOMOTION_LOCKED_STATES: ReadonlySet<ActionState> = new Set([
  "AttackStartup",
  "AttackActive",
  "AttackRecovery",
  "Block",
  "BlockStun",
  "Dodge",
  "HitStun",
  "GuardBroken",
  "Dead",
]);

function clampStamina(value: number): number {
  return Math.max(0, Math.min(MAX_STAMINA, value));
}

/**
 * Pure per-tick step: no I/O, no wall-clock reads, no randomness beyond
 * `state.rngSeed` (ADR 0001). Runs identically on server and client, so both
 * sides agree on a jump, a landing, or a hit given the same state and
 * inputs.
 *
 * Stages follow the Phase 4 plan's fixed order: (1) apply inputs to the FSM,
 * (2) integrate physics, then (3-9) `combat/resolve.ts` gathers hitboxes,
 * tests hurtboxes, and applies block/dodge/damage/knockback/hitstun/KO.
 */
export function step(
  state: SimState,
  inputs: Readonly<Partial<Record<PlayerId, InputFrame>>>,
): StepResult {
  const events: SimEvent[] = [];
  const postPhysics: Record<PlayerId, SimPlayer> = {};

  for (const id of Object.keys(state.players) as PlayerId[]) {
    const prev = state.players[id]!;
    const input = inputs[id];
    const bits = input?.bits ?? 0;
    const wasGrounded = prev.grounded;

    const weapon = getWeapon(prev.weapon);
    const fsm = applyFsm(prev, bits, weapon);
    const locked = LOCOMOTION_LOCKED_STATES.has(fsm.action);

    const { coyoteTicks: coyoteAfterGround, jumpBufferTicks: bufferAfterInput } =
      updateJumpCounters(prev, bits, wasGrounded);
    let coyoteTicks = coyoteAfterGround;
    let jumpBufferTicks = bufferAfterInput;

    // Always run friction/acceleration, even locked — with bits forced to 0
    // that's pure friction, so knockback velocity decays normally instead of
    // drifting forever because a locked state skipped it entirely.
    let vel = applyHorizontalMovement(prev.vel, locked ? 0 : bits, DT);
    const facing = locked ? prev.facing : updateFacing(prev.facing, bits);
    vel = applyGravity(vel, DT);

    let dropThroughTicks = Math.max(0, prev.dropThroughTicks - 1);

    if (!locked) {
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
    }

    const box = { x: prev.pos.x, y: prev.pos.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
    const platforms = dropThroughTicks > 0 ? [] : state.arena.platforms;
    const swept = sweep(box, vel, DT, state.arena.solids, platforms);

    if (swept.grounded && !wasGrounded) {
      events.push({ type: "land", playerId: id });
    }

    postPhysics[id] = {
      pos: swept.pos,
      vel: swept.vel,
      facing,
      grounded: swept.grounded,
      coyoteTicks,
      jumpBufferTicks,
      dropThroughTicks,
      lastInputSeq: input?.seq ?? prev.lastInputSeq,
      weapon: prev.weapon,
      action: fsm.action,
      actionTick: fsm.actionTick,
      attackKind: fsm.attackKind,
      hp: prev.hp,
      stamina: clampStamina(prev.stamina + fsm.staminaDelta),
      hitstunTicks: fsm.hitstunTicks,
      invulnTicks: fsm.invulnTicks,
      hitConfirmTicks: fsm.hitConfirmTicks,
      comboCount: fsm.comboCount,
    };
  }

  const combat = resolveCombat(postPhysics);
  events.push(...combat.events);

  return {
    state: { tick: state.tick + 1, players: combat.players, arena: state.arena, rngSeed: state.rngSeed },
    events,
  };
}
