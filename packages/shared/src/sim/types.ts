import type { ArenaRuntime } from "../arenas/types.js";
import type { ActionState, AttackKind } from "../combat/types.js";
import { MAX_HP, MAX_STAMINA } from "../config/game.js";
import type { HazardRuntimeState } from "../hazards/types.js";
import type { Vec } from "../math/vec.js";
import type { PlayerId, WeaponId } from "../types/ids.js";
import { WEAPON_IDS } from "../types/ids.js";

const DEFAULT_WEAPON: WeaponId = WEAPON_IDS.SWORD;

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

  // Combat (Phase 4, ADR 0001/plan Phase 4 step 1).
  weapon: WeaponId;
  action: ActionState;
  /** Ticks spent in the current `action`; resets to 0 whenever `action`
   *  changes, so weapon frame data (`combat/weapons.ts`) can be indexed by
   *  it directly. */
  actionTick: number;
  /** Which attack is in flight during AttackStartup/Active/Recovery — `null`
   *  outside those states. */
  attackKind: AttackKind | null;
  hp: number;
  stamina: number;
  /** Hitstun ticks remaining, decremented every tick; `action` stays
   *  HitStun/GuardBroken while this is > 0. */
  hitstunTicks: number;
  /** Dodge invulnerability ticks remaining (see `DODGE_IFRAME_TICKS`). */
  invulnTicks: number;
  /** Ticks remaining in which a landed hit lets AttackRecovery cancel early
   *  into Dodge (a hit-confirm cancel) — internal to `fsm.ts`, not named in
   *  the plan's headline `SimPlayer` field list, same precedent as
   *  `dropThroughTicks` above. */
  hitConfirmTicks: number;
  /** How many lights have chained without returning to a neutral state —
   *  drives the Sword's "light chains x2" trait in `weapons.ts`. */
  comboCount: number;

  // Match flow (Phase 5). Tracked here, not in `MatchDirector`, so a
  // kill-zone ring-out's "credit the last attacker within 3s" rule
  // (`RING_OUT_CREDIT_TICKS`) is itself pure and covered by determinism
  // tests, the same way combat's hit resolution is.
  /** Whoever last landed a hit/block/guard-break against this player. */
  lastHitBy: PlayerId | null;
  /** Absolute tick `lastHitBy` last landed a hit, for the ring-out credit
   *  window; meaningless while `lastHitBy` is `null`. */
  lastHitTick: number;
}

export interface SimState {
  tick: number;
  players: Record<PlayerId, SimPlayer>;
  arena: ArenaRuntime;
  /** The only allowed source of randomness in the sim (ADR 0001) — unused
   *  until a later phase's hazards/power-ups need it, but part of the state
   *  hash now so determinism tests cover it from the start. */
  rngSeed: number;
  /** Per-hazard dynamic state (hp, broken/fallen phase, timers), keyed by
   *  `HazardDef.id` — `undefined` is equivalent to "every hazard at its
   *  fresh `createHazardState` value" (`GameSimulation.step` treats it that
   *  way), so every `SimState` literal written before this phase — dozens
   *  across `sim`/`net`/`testing`/server/client tests — stays valid without
   *  editing each one to add an empty `hazards: {}`. New code should still
   *  populate it explicitly via `createHazardState(arena.hazards)`. */
  hazards?: Readonly<Record<string, HazardRuntimeState>>;
}

export function createSimPlayer(pos: Vec, weapon: WeaponId = DEFAULT_WEAPON): SimPlayer {
  return {
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    facing: 1,
    grounded: false,
    coyoteTicks: 0,
    jumpBufferTicks: 0,
    dropThroughTicks: 0,
    lastInputSeq: 0,
    weapon,
    action: "Idle",
    actionTick: 0,
    attackKind: null,
    hp: MAX_HP,
    stamina: MAX_STAMINA,
    hitstunTicks: 0,
    invulnTicks: 0,
    hitConfirmTicks: 0,
    comboCount: 0,
    lastHitBy: null,
    lastHitTick: 0,
  };
}
