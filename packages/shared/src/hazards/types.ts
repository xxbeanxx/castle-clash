import type { AABB } from "../math/aabb.js";
import type { Vec } from "../math/vec.js";

export type HazardKind =
  | "fireZone"
  | "breakableFloor"
  | "killZone"
  | "timedTrap"
  | "collapsingPlatform";

interface HazardDefBase {
  id: string;
  kind: HazardKind;
  box: AABB;
}

/** Damage over time plus a small hitstun-free knockback (plan step 1). A
 *  `cycle` alternates on/off in lockstep across every arena (a pure function
 *  of the match tick, so it's never persisted state — see `step.ts`);
 *  omitting it means always-on. */
export interface FireZoneDef extends HazardDefBase {
  kind: "fireZone";
  dps: number;
  cycle?: { onTicks: number; offTicks: number };
}

/** Acts as a solid while `hp > 0` (plan step 1). `breakOn` picks which event
 *  decrements `hp`: `"heavy"` only a heavy attack's hitbox overlapping the
 *  floor, `"any"` any attack's, `"landing"` a player landing on top of it.
 *  `respawnPerRound` (always `true` today — nothing in this phase turns it
 *  off) is read by `hazards/state.ts`'s round-reset factory, not `step.ts`. */
export interface BreakableFloorDef extends HazardDefBase {
  kind: "breakableFloor";
  hp: number;
  breakOn: "heavy" | "any" | "landing";
  respawnPerRound: boolean;
}

/** Instant elimination on overlap — arena-authored, in addition to (and
 *  merged with, at sim time) `ArenaDefinition.killZones`'s static blast-zone
 *  geometry. See `arenas/types.ts` for why both exist. */
export interface KillZoneDef extends HazardDefBase {
  kind: "killZone";
}

/** Telegraphed via a `warn` phase before it activates (plan step 1). Both
 *  `phase` and the active/warn timing are pure functions of the match tick
 *  and `periodTicks`/`warnTicks` (see `step.ts`'s `timedTrapPhase`) — a
 *  trap never carries persisted state of its own, unlike `CollapsingPlatformDef`,
 *  whose fall is triggered by player behavior instead. */
export interface TimedTrapDef extends HazardDefBase {
  kind: "timedTrap";
  damage: number;
  knockback: Vec;
  periodTicks: number;
  warnTicks: number;
}

/** Falls `delayTicks` after first being stood on (plan step 1) — genuinely
 *  stateful (see `HazardRuntimeState.timer`), since the trigger depends on
 *  player behavior, not just the tick. */
export interface CollapsingPlatformDef extends HazardDefBase {
  kind: "collapsingPlatform";
  delayTicks: number;
}

export type HazardDef =
  | FireZoneDef
  | BreakableFloorDef
  | KillZoneDef
  | TimedTrapDef
  | CollapsingPlatformDef;

/**
 * Per-match dynamic hazard state (plan step 4's `MatchState.hazards:
 * MapSchema<HazardState {id, kind, active, hp, phase}>` — `timer` is an
 * addition beyond that headline field list, needed only by
 * `CollapsingPlatformDef`'s player-triggered countdown; every other kind
 * either ignores it or (TimedTrap) derives its phase from the tick instead
 * of storing one). `hp`/`phase`/`timer` are meaningless noise for kinds that
 * don't use them — kept as one flat shape (rather than a per-kind union)
 * because that's what a `@colyseus/schema` class can sync as fixed fields.
 */
export interface HazardRuntimeState {
  id: string;
  kind: HazardKind;
  /** Whether this hazard currently behaves as its "on" kind: a lit
   *  FireZone, a not-yet-broken BreakableFloor, a not-yet-fallen
   *  CollapsingPlatform, a firing TimedTrap, or (always) a KillZone. */
  active: boolean;
  /** Remaining hit points — `BreakableFloorDef` only. */
  hp: number;
  /** Kind-specific display phase: FireZone `"on" | "off"`; BreakableFloor
   *  `"solid" | "broken"`; TimedTrap `"idle" | "warn" | "active"`;
   *  CollapsingPlatform `"stable" | "shaking" | "fallen"`; KillZone `""`. */
  phase: string;
  /** Ticks remaining until a CollapsingPlatform falls, once triggered;
   *  unused by every other kind. */
  timer: number;
}
