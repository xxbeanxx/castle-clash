import {
  BLOCK_STUN_TICKS,
  DODGE_IFRAME_TICKS,
  DODGE_STAMINA_COST,
  DODGE_TOTAL_TICKS,
  STAMINA_REGEN_PER_TICK,
} from "../config/game.js";
import { has } from "../input/bitmask.js";
import type { SimPlayer } from "../sim/types.js";
import type { ActionState, AttackKind } from "./types.js";
import { getAttack, type WeaponDef } from "./weapons.js";

export interface FsmContext {
  actionTick: number;
  bits: number;
  grounded: boolean;
  stamina: number;
  /** Ticks of hitstun/guard-break stun remaining AFTER this tick's decay —
   *  callers decrement before building the context (see `applyFsm`), the
   *  same convention `movement.ts`'s `updateJumpCounters` uses. */
  hitstunTicksRemaining: number;
  /** Ticks remaining in which landing a hit lets AttackRecovery cancel early
   *  into Dodge, also already decayed for this tick. */
  hitConfirmTicksRemaining: number;
  comboCount: number;
  attackKind: AttackKind | null;
  weapon: WeaponDef;
}

function canAffordDodge(ctx: FsmContext): boolean {
  return has(ctx.bits, "DODGE") && ctx.stamina >= DODGE_STAMINA_COST;
}

/** Where Idle/Run/AttackRecovery/Block/BlockStun/Dodge/HitStun/GuardBroken
 *  all land once their state naturally ends: grounded and moving -> Run,
 *  grounded and still -> Idle, airborne -> Airborne. */
function neutralExit(ctx: FsmContext): ActionState {
  if (!ctx.grounded) {
    return "Airborne";
  }
  return has(ctx.bits, "LEFT") || has(ctx.bits, "RIGHT") ? "Run" : "Idle";
}

/** The actions available from any grounded, un-committed state — shared by
 *  Idle and Run so both offer the same attack/block/dodge options. */
function neutralActions(ctx: FsmContext): ActionState | null {
  if (!ctx.grounded) {
    return "Airborne";
  }
  if (canAffordDodge(ctx)) {
    return "Dodge";
  }
  if (has(ctx.bits, "BLOCK")) {
    return "Block";
  }
  if (has(ctx.bits, "HEAVY") || has(ctx.bits, "LIGHT")) {
    return "AttackStartup";
  }
  return null;
}

/**
 * The player action state machine (Phase 4 plan step 1): one pure function
 * per state, keyed so every state is covered (checked by `fsm.test.ts`'s
 * table-driven pass over `ALL_STATES`). `null` means "no rule matched this
 * tick — stay in the current state"; `applyFsm` below falls back to that.
 *
 * Blocked transitions are structural, not special-cased: HitStun never reads
 * LIGHT/HEAVY (can't attack out of hitstun) and Airborne never reads BLOCK
 * (can't block while airborne).
 */
export const TRANSITIONS: Record<ActionState, (ctx: FsmContext) => ActionState | null> = {
  Idle(ctx) {
    const action = neutralActions(ctx);
    if (action) {
      return action;
    }
    return has(ctx.bits, "LEFT") || has(ctx.bits, "RIGHT") ? "Run" : null;
  },

  Run(ctx) {
    const action = neutralActions(ctx);
    if (action) {
      return action;
    }
    return has(ctx.bits, "LEFT") || has(ctx.bits, "RIGHT") ? null : "Idle";
  },

  Airborne(ctx) {
    if (ctx.grounded) {
      return neutralExit(ctx);
    }
    if (canAffordDodge(ctx)) {
      return "Dodge";
    }
    if (has(ctx.bits, "HEAVY") || has(ctx.bits, "LIGHT")) {
      return "AttackStartup";
    }
    return null;
  },

  AttackStartup(ctx) {
    const attack = getAttack(ctx.weapon, ctx.attackKind ?? "light");
    return ctx.actionTick + 1 >= attack.startup ? "AttackActive" : null;
  },

  AttackActive(ctx) {
    const attack = getAttack(ctx.weapon, ctx.attackKind ?? "light");
    return ctx.actionTick + 1 >= attack.active ? "AttackRecovery" : null;
  },

  AttackRecovery(ctx) {
    if (ctx.hitConfirmTicksRemaining > 0 && canAffordDodge(ctx)) {
      return "Dodge";
    }
    if (
      ctx.attackKind === "light" &&
      has(ctx.bits, "LIGHT") &&
      ctx.comboCount + 1 < ctx.weapon.lightChainLimit
    ) {
      return "AttackStartup";
    }
    const attack = getAttack(ctx.weapon, ctx.attackKind ?? "light");
    return ctx.actionTick + 1 >= attack.recovery ? neutralExit(ctx) : null;
  },

  Block(ctx) {
    return has(ctx.bits, "BLOCK") ? null : neutralExit(ctx);
  },

  BlockStun(ctx) {
    return ctx.actionTick + 1 >= BLOCK_STUN_TICKS ? neutralExit(ctx) : null;
  },

  Dodge(ctx) {
    return ctx.actionTick + 1 >= DODGE_TOTAL_TICKS ? neutralExit(ctx) : null;
  },

  HitStun(ctx) {
    return ctx.hitstunTicksRemaining <= 0 ? neutralExit(ctx) : null;
  },

  GuardBroken(ctx) {
    return ctx.hitstunTicksRemaining <= 0 ? neutralExit(ctx) : null;
  },

  Dead() {
    return null;
  },
};

const ATTACK_STATES: ReadonlySet<ActionState> = new Set([
  "AttackStartup",
  "AttackActive",
  "AttackRecovery",
]);

export interface FsmOutcome {
  action: ActionState;
  actionTick: number;
  attackKind: AttackKind | null;
  comboCount: number;
  hitstunTicks: number;
  invulnTicks: number;
  hitConfirmTicks: number;
  /** Stamina change to apply this tick: passive regen in neutral states, or
   *  the Dodge cost on a fresh entry. Resolve-stage stamina drain from a
   *  blocked hit is separate and applied afterward by `combat/resolve.ts`. */
  staminaDelta: number;
}

/**
 * Runs one player's FSM tick (plan Phase 4 step 1's "apply inputs to the
 * FSM" stage): looks up `TRANSITIONS[player.action]`, then derives the
 * attack/combo/stamina side effects of that transition. Never inspects
 * whether a hit landed this tick — `combat/resolve.ts` runs after this stage
 * and can overwrite the outcome (forcing HitStun/BlockStun/GuardBroken/Dead)
 * regardless of what the FSM proposed, the same way a real fighting game
 * lets an incoming hit interrupt an in-progress action.
 */
export function applyFsm(player: SimPlayer, bits: number, weapon: WeaponDef): FsmOutcome {
  const hitstunTicksRemaining = Math.max(0, player.hitstunTicks - 1);
  const hitConfirmTicksRemaining = Math.max(0, player.hitConfirmTicks - 1);
  const invulnTicksDecayed = Math.max(0, player.invulnTicks - 1);

  const ctx: FsmContext = {
    actionTick: player.actionTick,
    bits,
    grounded: player.grounded,
    stamina: player.stamina,
    hitstunTicksRemaining,
    hitConfirmTicksRemaining,
    comboCount: player.comboCount,
    attackKind: player.attackKind,
    weapon,
  };

  const proposed = TRANSITIONS[player.action](ctx) ?? player.action;
  const changed = proposed !== player.action;

  let attackKind = player.attackKind;
  let comboCount = player.comboCount;
  let invulnTicks = invulnTicksDecayed;
  let staminaDelta = 0;

  if (ATTACK_STATES.has(proposed)) {
    if (proposed === "AttackStartup" && changed) {
      if (player.action === "AttackRecovery") {
        attackKind = "light";
        comboCount = player.comboCount + 1;
      } else {
        attackKind = has(bits, "HEAVY") ? "heavy" : "light";
        comboCount = 0;
      }
    }
    // Otherwise the attack continues (AttackActive/Recovery, or staying in
    // AttackStartup): keep the attackKind/comboCount already committed.
  } else {
    attackKind = null;
    comboCount = 0;
  }

  if (proposed === "Dodge" && changed) {
    staminaDelta = -DODGE_STAMINA_COST;
    invulnTicks = DODGE_IFRAME_TICKS;
  } else if (proposed === "Idle" || proposed === "Run" || proposed === "Airborne") {
    staminaDelta = STAMINA_REGEN_PER_TICK;
  }

  return {
    action: proposed,
    actionTick: changed ? 0 : player.actionTick + 1,
    attackKind,
    comboCount,
    hitstunTicks: hitstunTicksRemaining,
    invulnTicks,
    hitConfirmTicks: hitConfirmTicksRemaining,
    staminaDelta,
  };
}
