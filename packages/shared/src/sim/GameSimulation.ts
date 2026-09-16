import { applyFsm } from "../combat/fsm.js";
import { resolveCombat, type CombatEvent, type CombatModifiers } from "../combat/resolve.js";
import type { ActionState } from "../combat/types.js";
import { getWeapon, type WeaponDef } from "../combat/weapons.js";
import {
  DROP_THROUGH_TICKS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RING_OUT_CREDIT_TICKS,
  TICK_RATE,
} from "../config/game.js";
import { dynamicPlatforms, dynamicSolids, stepHazards, type HazardEvent } from "../hazards/step.js";
import type { InputFrame } from "../input/bitmask.js";
import { overlaps } from "../math/aabb.js";
import { BASE_STATS, computeStats, deriveWeapon } from "../powerups/computeStats.js";
import type { DerivedStats } from "../powerups/types.js";
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

/** Elimination sources (plan Phase 5 step 2): HP reaching 0 (`combat/
 *  resolve.ts`'s `ko`), entering a kill zone, or — synthesized by
 *  `MatchDirector`, never by `step()` itself — a disconnect during
 *  `RoundActive`. `by` credits whoever last landed a hit within
 *  `RING_OUT_CREDIT_TICKS`, so a ring-out (falling into a kill zone after
 *  being knocked back) still counts as a kill. */
export type EliminatedEvent = {
  type: "eliminated";
  victim: PlayerId;
  by?: PlayerId;
  cause: "ko" | "killZone" | "disconnect" | "hazard";
};

export type SimEvent =
  | { type: "jump" | "land"; playerId: PlayerId }
  | CombatEvent
  | EliminatedEvent
  | HazardEvent
  /** A `ringOutArmor` power-up charge absorbed what would otherwise have
   *  been a kill-zone elimination this tick (plan Phase 7) — fx-only, same
   *  as `jump`/`land`, never stored in schema. */
  | { type: "ringOutArmorUsed"; playerId: PlayerId };

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

function clampStamina(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

/** The arena spawn point closest to `pos` (by straight-line distance) — used
 *  to reposition a player a `ringOutArmor` charge just saved from a kill-zone
 *  elimination, so they land back on solid ground near where they fell
 *  rather than at a fixed, possibly-far-away spawn. */
function nearestSpawn(pos: SimPlayer["pos"], spawns: SimState["arena"]["spawns"]): SimPlayer["pos"] {
  let best = spawns[0]!;
  let bestDist = Infinity;
  for (const spawn of spawns) {
    const dist = (spawn.x - pos.x) ** 2 + (spawn.y - pos.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = spawn;
    }
  }
  return { x: best.x, y: best.y };
}

/** Brief invulnerability granted after a `ringOutArmor` save, so the player
 *  isn't immediately re-hit the instant they're teleported back onto solid
 *  ground — deliberately shorter than a full dodge (`DODGE_IFRAME_TICKS`),
 *  since this is a safety net, not a defensive tool to play around. */
const RING_OUT_ARMOR_INVULN_TICKS = 30;

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
  const landedIds = new Set<PlayerId>();
  // Per-player power-up-derived weapon/stats (plan Phase 7), computed once
  // per player per tick and reused below by `resolveCombat` and
  // `stepHazards` — both accept these as plain per-player maps rather than
  // recomputing them, so `combat/`/`hazards/` never import from `powerups/`.
  const weaponsById: Record<PlayerId, WeaponDef> = {};
  const statsById: Record<PlayerId, DerivedStats> = {};

  // Dynamic geometry hazards contribute to physics this tick — read from
  // the END of the previous tick (`prevHazardState`), the same way every
  // other per-tick input (FSM state, velocity, ...) is read from `prev`
  // before this tick's own hazard step (below) computes what comes next.
  const prevHazardState = state.hazards ?? {};
  const solids = [...state.arena.solids, ...dynamicSolids(state.arena.hazards, prevHazardState)];
  const extraPlatforms = dynamicPlatforms(state.arena.hazards, prevHazardState);

  for (const id of Object.keys(state.players) as PlayerId[]) {
    const prev = state.players[id]!;
    const input = inputs[id];
    const bits = input?.bits ?? 0;
    const wasGrounded = prev.grounded;

    const baseWeapon = getWeapon(prev.weapon);
    const stats = computeStats(BASE_STATS, baseWeapon, prev.powerups ?? {});
    const weapon = deriveWeapon(baseWeapon, stats);
    weaponsById[id] = weapon;
    statsById[id] = stats;

    const fsm = applyFsm(prev, bits, weapon, {
      dodgeIFrameTicks: stats.dodgeIFrames,
      staminaRegenPerTick: stats.staminaRegenPerTick,
    });
    const locked = LOCOMOTION_LOCKED_STATES.has(fsm.action);

    const { coyoteTicks: coyoteAfterGround, jumpBufferTicks: bufferAfterInput } =
      updateJumpCounters(prev, bits, wasGrounded);
    let coyoteTicks = coyoteAfterGround;
    let jumpBufferTicks = bufferAfterInput;
    let airJumpsUsed = wasGrounded ? 0 : (prev.airJumpsUsed ?? 0);

    // Always run friction/acceleration, even locked — with bits forced to 0
    // that's pure friction, so knockback velocity decays normally instead of
    // drifting forever because a locked state skipped it entirely.
    let vel = applyHorizontalMovement(prev.vel, locked ? 0 : bits, DT, stats.moveSpeed);
    const facing = locked ? prev.facing : updateFacing(prev.facing, bits);
    vel = applyGravity(vel, DT);

    let dropThroughTicks = Math.max(0, prev.dropThroughTicks - 1);

    if (!locked) {
      if (wasGrounded && shouldDropThrough(bits)) {
        dropThroughTicks = DROP_THROUGH_TICKS;
      } else {
        const attempt = tryJump(vel, coyoteTicks, jumpBufferTicks, stats.jumpVelocity);
        vel = attempt.vel;
        coyoteTicks = attempt.coyoteTicks;
        jumpBufferTicks = attempt.jumpBufferTicks;
        if (attempt.jumped) {
          events.push({ type: "jump", playerId: id });
        } else if (stats.effects.doubleJump && !wasGrounded && jumpBufferTicks > 0 && airJumpsUsed < 1) {
          // `doubleJump` (plan Phase 7): one extra mid-air jump, self-limited
          // by `airJumpsUsed` rather than edge-detecting the JUMP press —
          // holding the button can't spend a second one since this branch
          // stops matching once `airJumpsUsed` reaches 1, the same way a
          // held JUMP can't chain normal jumps once `coyoteTicks` hits 0.
          vel = { x: vel.x, y: -stats.jumpVelocity };
          jumpBufferTicks = 0;
          airJumpsUsed += 1;
          events.push({ type: "jump", playerId: id });
        }
      }
      vel = applyVariableJumpHeight(vel, bits);
    }

    const box = { x: prev.pos.x, y: prev.pos.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
    const platforms = dropThroughTicks > 0 ? [] : [...state.arena.platforms, ...extraPlatforms];
    const swept = sweep(box, vel, DT, solids, platforms);

    if (swept.grounded && !wasGrounded) {
      events.push({ type: "land", playerId: id });
      landedIds.add(id);
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
      stamina: clampStamina(prev.stamina + fsm.staminaDelta, stats.staminaMax),
      hitstunTicks: fsm.hitstunTicks,
      invulnTicks: fsm.invulnTicks,
      hitConfirmTicks: fsm.hitConfirmTicks,
      comboCount: fsm.comboCount,
      lastHitBy: prev.lastHitBy,
      lastHitTick: prev.lastHitTick,
      powerups: prev.powerups,
      airJumpsUsed,
      ringOutArmorChargesUsed: prev.ringOutArmorChargesUsed,
    };
  }

  const modifiersById: Record<PlayerId, CombatModifiers> = {};
  for (const id of Object.keys(statsById) as PlayerId[]) {
    const stats = statsById[id]!;
    modifiersById[id] = {
      maxHp: stats.maxHp,
      staminaMax: stats.staminaMax,
      blockStaminaCostMultiplier: stats.blockStaminaCostMultiplier,
      knockbackResistFraction: stats.knockbackResistFraction,
      lifestealPct: stats.effects.lifestealPct,
      thornsPct: stats.effects.thornsPct,
    };
  }

  const nextTick = state.tick + 1;
  const combat = resolveCombat(postPhysics, weaponsById, modifiersById);
  events.push(...combat.events);

  let players: Record<PlayerId, SimPlayer> = { ...combat.players };

  // Record who last landed a hit, for kill-zone ring-out credit below.
  // `CombatEvent.defender` is typed optional only because "whiff" lacks
  // one — `resolve.ts` always sets it for hit/blocked/guardBreak/ko, so the
  // `!` below is safe, not a workaround.
  for (const event of combat.events) {
    if (event.type === "hit" || event.type === "blocked" || event.type === "guardBreak") {
      const defenderId = event.defender!;
      players[defenderId] = { ...players[defenderId]!, lastHitBy: event.attacker, lastHitTick: nextTick };
    }
    if (event.type === "ko") {
      events.push({ type: "eliminated", victim: event.defender!, by: event.attacker, cause: "ko" });
    }
  }

  // Hazards are one more damage/knockback/solidity layer on top of combat's
  // — see `hazards/step.ts`. A player hazards knock straight to 0 hp
  // (FireZone attrition, a lethal TimedTrap burst) has no attacker to
  // credit, unlike a `"ko"` from `resolveCombat` above.
  const beforeHazards = players;
  const fireImmuneIds = new Set<PlayerId>(
    (Object.keys(statsById) as PlayerId[]).filter((id) => statsById[id]!.effects.fireImmune),
  );
  const hazardResult = stepHazards({
    tick: nextTick,
    hazards: state.arena.hazards,
    prevState: prevHazardState,
    players: beforeHazards,
    landedIds,
    fireImmuneIds,
  });
  players = hazardResult.players;
  events.push(...hazardResult.events);
  for (const id of Object.keys(players) as PlayerId[]) {
    if (beforeHazards[id]!.action !== "Dead" && players[id]!.action === "Dead") {
      events.push({ type: "eliminated", victim: id, cause: "hazard" });
    }
  }

  // Kill zones: falling out of the arena is its own elimination source,
  // independent of HP — a full-health player can still be ring-out'd.
  // Merges the arena's static blast-zone geometry with any active
  // hazard-authored KillZone boxes this tick.
  const killZones = [...state.arena.killZones, ...hazardResult.killZoneBoxes];
  for (const id of Object.keys(players) as PlayerId[]) {
    const player = players[id]!;
    if (player.action === "Dead") {
      continue;
    }
    const box = { x: player.pos.x, y: player.pos.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
    if (!killZones.some((zone) => overlaps(box, zone))) {
      continue;
    }

    const stats = statsById[id];
    const chargesUsed = player.ringOutArmorChargesUsed ?? 0;
    const chargesAvailable = (stats?.effects.ringOutArmorCharges ?? 0) - chargesUsed;
    if (chargesAvailable > 0) {
      players[id] = {
        ...player,
        pos: nearestSpawn(player.pos, state.arena.spawns),
        vel: { x: 0, y: 0 },
        invulnTicks: Math.max(player.invulnTicks, RING_OUT_ARMOR_INVULN_TICKS),
        ringOutArmorChargesUsed: chargesUsed + 1,
      };
      events.push({ type: "ringOutArmorUsed", playerId: id });
      continue;
    }

    const credited =
      player.lastHitBy !== null && nextTick - player.lastHitTick <= RING_OUT_CREDIT_TICKS
        ? player.lastHitBy
        : undefined;
    players[id] = { ...player, action: "Dead", hp: 0, hitstunTicks: 0, vel: { x: 0, y: 0 } };
    events.push({ type: "eliminated", victim: id, by: credited, cause: "killZone" });
  }

  return {
    state: {
      tick: nextTick,
      players,
      arena: state.arena,
      rngSeed: state.rngSeed,
      hazards: hazardResult.state,
    },
    events,
  };
}
