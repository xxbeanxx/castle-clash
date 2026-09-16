import { getAttack, getWeapon, hitboxWorldBox } from "../combat/weapons.js";
import {
  FIRE_ZONE_KNOCKBACK_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TICK_RATE,
  TIMED_TRAP_ACTIVE_TICKS,
  TIMED_TRAP_HITSTUN_TICKS,
} from "../config/game.js";
import { overlaps, type AABB } from "../math/aabb.js";
import type { SimPlayer } from "../sim/types.js";
import type { PlayerId } from "../types/ids.js";
import type {
  BreakableFloorDef,
  CollapsingPlatformDef,
  FireZoneDef,
  HazardDef,
  HazardRuntimeState,
  TimedTrapDef,
} from "./types.js";

export type HazardEvent =
  | { type: "hazardBreak"; hazardId: string }
  | { type: "hazardFall"; hazardId: string }
  | { type: "hazardTrap"; hazardId: string; victims: readonly PlayerId[] };

export interface HazardStepInput {
  /** The already-incremented tick this step produces state FOR — matches
   *  `GameSimulation.step`'s `nextTick` convention (see its own doc comment). */
  tick: number;
  hazards: readonly HazardDef[];
  /** Hazard state as of the END of the previous tick — drives this tick's
   *  physics (`dynamicSolids`/`dynamicPlatforms`) before this function runs. */
  prevState: Readonly<Record<string, HazardRuntimeState>>;
  /** Post-physics, post-combat-resolution players — hazard damage/knockback
   *  is one more layer applied on top, the same way combat's is. */
  players: Readonly<Record<PlayerId, SimPlayer>>;
  /** Player ids whose `grounded` flipped false -> true this tick (physics
   *  stage), for `breakOn: "landing"`. */
  landedIds: ReadonlySet<PlayerId>;
  /** Players whose `fireImmune` power-up effect is active this tick (plan
   *  Phase 7) — skips FireZone's damage/knockback entirely. Optional and
   *  defaulted to empty so every pre-Phase-7 caller of `stepHazards` keeps
   *  working unmodified; `sim/GameSimulation.ts` is the only caller that
   *  ever passes a non-empty set. */
  fireImmuneIds?: ReadonlySet<PlayerId>;
}

export interface HazardStepResult {
  state: Record<string, HazardRuntimeState>;
  players: Record<PlayerId, SimPlayer>;
  /** Active KillZone hazard boxes this tick, to merge with
   *  `ArenaDefinition.killZones`'s static geometry. */
  killZoneBoxes: AABB[];
  events: HazardEvent[];
}

function playerBox(player: SimPlayer): AABB {
  return { x: player.pos.x, y: player.pos.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function computeFireZonePhase(def: FireZoneDef, tick: number): "on" | "off" {
  if (!def.cycle) {
    return "on";
  }
  const period = def.cycle.onTicks + def.cycle.offTicks;
  return mod(tick, period) < def.cycle.onTicks ? "on" : "off";
}

/** Idle until `periodTicks - warnTicks - TIMED_TRAP_ACTIVE_TICKS`, then warn,
 *  then a fixed active burst — a pure function of `tick` and the def, so
 *  (unlike `CollapsingPlatformDef`) a TimedTrap never needs persisted
 *  runtime state of its own. Arena authoring must keep `periodTicks >
 *  warnTicks + TIMED_TRAP_ACTIVE_TICKS` or the idle window collapses to
 *  nothing; `arenas/validate.ts` checks this. */
function computeTimedTrapPhase(def: TimedTrapDef, tick: number): "idle" | "warn" | "active" {
  const idleTicks = Math.max(0, def.periodTicks - def.warnTicks - TIMED_TRAP_ACTIVE_TICKS);
  const pos = mod(tick, def.periodTicks);
  if (pos < idleTicks) {
    return "idle";
  }
  return pos < idleTicks + def.warnTicks ? "warn" : "active";
}

function initialRuntimeState(def: HazardDef, tick: number): HazardRuntimeState {
  switch (def.kind) {
    case "fireZone": {
      const phase = computeFireZonePhase(def, tick);
      return { id: def.id, kind: def.kind, active: phase === "on", hp: 0, phase, timer: 0 };
    }
    case "breakableFloor":
      return { id: def.id, kind: def.kind, active: true, hp: def.hp, phase: "solid", timer: 0 };
    case "killZone":
      return { id: def.id, kind: def.kind, active: true, hp: 0, phase: "", timer: 0 };
    case "timedTrap": {
      const phase = computeTimedTrapPhase(def, tick);
      return { id: def.id, kind: def.kind, active: phase === "active", hp: 0, phase, timer: 0 };
    }
    case "collapsingPlatform":
      return { id: def.id, kind: def.kind, active: true, hp: 0, phase: "stable", timer: 0 };
  }
}

/** The match-creation initial state — every hazard fresh. */
export function createHazardState(
  hazards: readonly HazardDef[],
): Record<string, HazardRuntimeState> {
  return resetHazardState(hazards, {}, 0);
}

/** Between-round reset (plan step 4: "breakable floors reset between
 *  rounds"). A `BreakableFloorDef` with `respawnPerRound: false` carries its
 *  state over instead — nothing in this phase's six arenas sets that, but
 *  the field exists for a later arena to opt out. */
export function resetHazardState(
  hazards: readonly HazardDef[],
  prevState: Readonly<Record<string, HazardRuntimeState>>,
  tick: number,
): Record<string, HazardRuntimeState> {
  const state: Record<string, HazardRuntimeState> = {};
  for (const def of hazards) {
    if (def.kind === "breakableFloor" && !def.respawnPerRound && prevState[def.id]) {
      state[def.id] = prevState[def.id]!;
      continue;
    }
    state[def.id] = initialRuntimeState(def, tick);
  }
  return state;
}

/** Solid geometry contributed by hazards THIS tick's physics sweep should
 *  collide against — a not-yet-broken `BreakableFloorDef`. Reads
 *  `prevState` (the end of the previous tick), consistent with the rest of
 *  `GameSimulation.step` using `prev` to drive this tick's physics. */
export function dynamicSolids(
  hazards: readonly HazardDef[],
  state: Readonly<Record<string, HazardRuntimeState>>,
): AABB[] {
  const boxes: AABB[] = [];
  for (const def of hazards) {
    if (def.kind !== "breakableFloor") {
      continue;
    }
    if (state[def.id]?.active ?? true) {
      boxes.push(def.box);
    }
  }
  return boxes;
}

/** One-way platform geometry contributed by hazards — a not-yet-fallen
 *  `CollapsingPlatformDef`. */
export function dynamicPlatforms(
  hazards: readonly HazardDef[],
  state: Readonly<Record<string, HazardRuntimeState>>,
): AABB[] {
  const boxes: AABB[] = [];
  for (const def of hazards) {
    if (def.kind !== "collapsingPlatform") {
      continue;
    }
    if ((state[def.id]?.phase ?? "stable") !== "fallen") {
      boxes.push(def.box);
    }
  }
  return boxes;
}

function attackDamageOnBox(box: AABB, breakOn: "heavy" | "any", players: Readonly<Record<PlayerId, SimPlayer>>): number {
  let total = 0;
  for (const player of Object.values(players)) {
    if (player.action !== "AttackActive" || player.attackKind === null) {
      continue;
    }
    if (breakOn === "heavy" && player.attackKind !== "heavy") {
      continue;
    }
    const attack = getAttack(getWeapon(player.weapon), player.attackKind);
    const activeHitboxes = attack.hitboxes.filter((hb) => hb.tickOffset === player.actionTick);
    const connects = activeHitboxes.some((hb) => overlaps(hitboxWorldBox(player.pos, player.facing, hb.box), box));
    if (connects) {
      total += attack.damage;
    }
  }
  return total;
}

function landedOnBox(box: AABB, players: Readonly<Record<PlayerId, SimPlayer>>, landedIds: ReadonlySet<PlayerId>): boolean {
  for (const id of landedIds) {
    const player = players[id];
    if (player && overlaps(playerBox(player), box)) {
      return true;
    }
  }
  return false;
}

function stepBreakableFloor(
  def: BreakableFloorDef,
  prev: HazardRuntimeState,
  players: Readonly<Record<PlayerId, SimPlayer>>,
  landedIds: ReadonlySet<PlayerId>,
): HazardRuntimeState {
  if (prev.hp <= 0) {
    return { id: def.id, kind: def.kind, active: false, hp: 0, phase: "broken", timer: 0 };
  }

  let hp = prev.hp;
  if (def.breakOn === "landing") {
    if (landedOnBox(def.box, players, landedIds)) {
      hp = 0;
    }
  } else {
    hp -= attackDamageOnBox(def.box, def.breakOn, players);
  }
  hp = Math.max(0, hp);

  return { id: def.id, kind: def.kind, active: hp > 0, hp, phase: hp > 0 ? "solid" : "broken", timer: 0 };
}

function isAnyoneStandingOn(box: AABB, players: Readonly<Record<PlayerId, SimPlayer>>): boolean {
  for (const player of Object.values(players)) {
    if (player.grounded && overlaps(playerBox(player), box)) {
      return true;
    }
  }
  return false;
}

function stepCollapsingPlatform(
  def: CollapsingPlatformDef,
  prev: HazardRuntimeState,
  players: Readonly<Record<PlayerId, SimPlayer>>,
): HazardRuntimeState {
  if (prev.phase === "fallen") {
    return prev;
  }
  if (prev.phase === "stable") {
    if (isAnyoneStandingOn(def.box, players)) {
      return { id: def.id, kind: def.kind, active: true, hp: 0, phase: "shaking", timer: def.delayTicks };
    }
    return prev;
  }
  // shaking: falls once triggered, regardless of whether still stood on.
  const timer = prev.timer - 1;
  if (timer <= 0) {
    return { id: def.id, kind: def.kind, active: false, hp: 0, phase: "fallen", timer: 0 };
  }
  return { ...prev, timer };
}

/**
 * Applies every arena hazard for one tick (called from `GameSimulation.step`
 * after combat resolution — hazard damage/knockback is one more layer on
 * top of that tick's players, the same way `resolveCombat`'s is on top of
 * physics). Never mutates `players`/`prevState` — returns fresh copies.
 */
export function stepHazards(input: HazardStepInput): HazardStepResult {
  const { tick, hazards, prevState, landedIds } = input;
  const fireImmuneIds = input.fireImmuneIds ?? new Set<PlayerId>();
  const state: Record<string, HazardRuntimeState> = {};
  const killZoneBoxes: AABB[] = [];
  const events: HazardEvent[] = [];
  let players: Record<PlayerId, SimPlayer> = { ...input.players };

  for (const def of hazards) {
    const prev = prevState[def.id] ?? initialRuntimeState(def, tick);

    switch (def.kind) {
      case "fireZone": {
        const phase = computeFireZonePhase(def, tick);
        state[def.id] = { id: def.id, kind: def.kind, active: phase === "on", hp: 0, phase, timer: 0 };
        if (phase === "on") {
          const dps = def.dps / TICK_RATE;
          const center = def.box.x + def.box.w / 2;
          for (const id of Object.keys(players) as PlayerId[]) {
            const player = players[id]!;
            if (
              player.action === "Dead" ||
              !overlaps(playerBox(player), def.box) ||
              fireImmuneIds.has(id)
            ) {
              continue;
            }
            const pushDir = player.pos.x + PLAYER_WIDTH / 2 >= center ? 1 : -1;
            const hp = Math.max(0, player.hp - dps);
            players[id] = {
              ...player,
              hp,
              // Hitstun-free per the plan — no action/hitstun change, even
              // when this tick's damage is lethal.
              action: hp <= 0 ? "Dead" : player.action,
              vel: { x: player.vel.x + pushDir * FIRE_ZONE_KNOCKBACK_SPEED, y: player.vel.y },
            };
          }
        }
        break;
      }

      case "breakableFloor": {
        const runtime = stepBreakableFloor(def, prev, players, landedIds);
        if (prev.active && !runtime.active) {
          events.push({ type: "hazardBreak", hazardId: def.id });
        }
        state[def.id] = runtime;
        break;
      }

      case "killZone": {
        state[def.id] = { id: def.id, kind: def.kind, active: true, hp: 0, phase: "", timer: 0 };
        killZoneBoxes.push(def.box);
        break;
      }

      case "timedTrap": {
        const phase = computeTimedTrapPhase(def, tick);
        const enteringActive = phase === "active" && computeTimedTrapPhase(def, tick - 1) !== "active";
        state[def.id] = { id: def.id, kind: def.kind, active: phase === "active", hp: 0, phase, timer: 0 };
        if (enteringActive) {
          const victims: PlayerId[] = [];
          for (const id of Object.keys(players) as PlayerId[]) {
            const player = players[id]!;
            if (player.action === "Dead" || player.invulnTicks > 0 || !overlaps(playerBox(player), def.box)) {
              continue;
            }
            victims.push(id);
            const hp = Math.max(0, player.hp - def.damage);
            players[id] = {
              ...player,
              hp,
              action: hp <= 0 ? "Dead" : "HitStun",
              actionTick: 0,
              attackKind: null,
              hitstunTicks: hp <= 0 ? 0 : TIMED_TRAP_HITSTUN_TICKS,
              vel: { x: def.knockback.x, y: def.knockback.y },
            };
          }
          if (victims.length > 0) {
            events.push({ type: "hazardTrap", hazardId: def.id, victims });
          }
        }
        break;
      }

      case "collapsingPlatform": {
        const runtime = stepCollapsingPlatform(def, prev, players);
        if (prev.phase !== "fallen" && runtime.phase === "fallen") {
          events.push({ type: "hazardFall", hazardId: def.id });
        }
        state[def.id] = runtime;
        break;
      }
    }
  }

  return { state, players, killZoneBoxes, events };
}
