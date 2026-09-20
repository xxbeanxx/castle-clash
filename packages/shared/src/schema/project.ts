import { isActionState, isAttackKind } from "../combat/types.js";
import { isPowerUpId } from "../powerups/defs.js";
import type { PowerUpId } from "../powerups/types.js";
import type { SimPlayer, SimState } from "../sim/types.js";
import { isWeaponId, playerId, WEAPON_IDS, type PlayerId } from "../types/ids.js";
import type { MatchState, PlayerState } from "./state.js";

/** Flattens `powerups` stack counts into one array entry per stack (the same
 *  shape `PlayerState.powerups` syncs, sorted by id for a stable diff) — a
 *  power-up owned at 3 stacks appears 3 times. */
function flattenPowerups(
  powerups: Readonly<Partial<Record<PowerUpId, number>>> | undefined,
): PowerUpId[] {
  const flat: PowerUpId[] = [];
  for (const id of (Object.keys(powerups ?? {}) as PowerUpId[]).sort()) {
    const count = powerups?.[id] ?? 0;
    for (let i = 0; i < count; i++) {
      flat.push(id);
    }
  }
  return flat;
}

/**
 * Copies sim state into the network schema once per tick (ADR 0001) — the
 * only place gameplay state crosses from plain `SimState` objects into
 * `@colyseus/schema` instances. Never creates or removes schema players:
 * `MatchRoom`'s `onJoin`/`onLeave` own that lifecycle, so a stale/unknown id
 * here is silently skipped rather than treated as a signal to add one.
 *
 * Syncs the player's full physics state, not just position: the owning
 * client's `Reconciler` replays pending inputs starting from exactly this
 * `SimPlayer` (via `schemaToSimPlayer`), so anything less would replay a
 * different trajectory than the server did.
 */
export function projectToSchema(
  sim: SimState,
  match: MatchState,
  lastProcessedSeq: Readonly<Partial<Record<PlayerId, number>>>,
): void {
  match.tick = sim.tick;
  match.suddenDeathTicks = sim.suddenDeathTicks ?? 0;

  // Hazard state (Phase 6) — same "never create/remove, only update"
  // contract as players: `MatchRoom` seeds `match.hazards` once from the
  // arena's `HazardDef`s at `onCreate`, so a hazard id with no existing
  // schema entry here is skipped rather than treated as a signal to add
  // one.
  const hazards = sim.hazards ?? {};
  for (const id of Object.keys(hazards)) {
    const schemaHazard = match.hazards.get(id);
    if (!schemaHazard) {
      continue;
    }
    const hazard = hazards[id]!;
    schemaHazard.active = hazard.active;
    schemaHazard.hp = hazard.hp;
    schemaHazard.phase = hazard.phase;
    schemaHazard.timer = hazard.timer;
  }

  for (const id of Object.keys(sim.players) as PlayerId[]) {
    const schemaPlayer = match.players.get(id);
    if (!schemaPlayer) {
      continue;
    }
    const simPlayer = sim.players[id]!;
    schemaPlayer.x = simPlayer.pos.x;
    schemaPlayer.y = simPlayer.pos.y;
    schemaPlayer.vx = simPlayer.vel.x;
    schemaPlayer.vy = simPlayer.vel.y;
    schemaPlayer.facing = simPlayer.facing;
    schemaPlayer.grounded = simPlayer.grounded;
    schemaPlayer.coyoteTicks = simPlayer.coyoteTicks;
    schemaPlayer.jumpBufferTicks = simPlayer.jumpBufferTicks;
    schemaPlayer.dropThroughTicks = simPlayer.dropThroughTicks;
    schemaPlayer.weapon = simPlayer.weapon;
    schemaPlayer.action = simPlayer.action;
    schemaPlayer.actionTick = simPlayer.actionTick;
    schemaPlayer.attackKind = simPlayer.attackKind ?? "";
    schemaPlayer.hp = simPlayer.hp;
    schemaPlayer.stamina = simPlayer.stamina;
    schemaPlayer.hitstunTicks = simPlayer.hitstunTicks;
    schemaPlayer.invulnTicks = simPlayer.invulnTicks;
    schemaPlayer.hitConfirmTicks = simPlayer.hitConfirmTicks;
    schemaPlayer.comboCount = simPlayer.comboCount;
    schemaPlayer.lastHitBy = simPlayer.lastHitBy ?? "";
    schemaPlayer.lastHitTick = simPlayer.lastHitTick;
    schemaPlayer.airJumpsUsed = simPlayer.airJumpsUsed ?? 0;
    schemaPlayer.ringOutArmorChargesUsed = simPlayer.ringOutArmorChargesUsed ?? 0;

    // Only touch the ArraySchema when the flattened stack list actually
    // changed — a pick happens once per round, so re-diffing/re-pushing
    // every tick regardless would be pure patch-bandwidth waste.
    const flat = flattenPowerups(simPlayer.powerups);
    const current = schemaPlayer.powerups;
    const changed =
      current.length !== flat.length || flat.some((powerId, i) => current[i] !== powerId);
    if (changed) {
      current.clear();
      for (const powerId of flat) {
        current.push(powerId);
      }
    }

    const ack = lastProcessedSeq[id];
    if (ack !== undefined) {
      schemaPlayer.lastProcessedSeq = ack;
    }
  }
}

/** The inverse of `projectToSchema` for one player — reconstructs the exact
 *  `SimPlayer` a client's `Reconciler` needs to replay pending inputs from. */
/** Tallies a flat `powerups` array back into stack counts — the inverse of
 *  `flattenPowerups`. */
function unflattenPowerups(flat: ArrayLike<string> = []): Record<PowerUpId, number> {
  const stacks: Record<PowerUpId, number> = {};
  for (let i = 0; i < flat.length; i++) {
    const raw = flat[i]!;
    if (!isPowerUpId(raw)) {
      continue;
    }
    stacks[raw] = (stacks[raw] ?? 0) + 1;
  }
  return stacks;
}

export function schemaToSimPlayer(schema: PlayerState): SimPlayer {
  return {
    pos: { x: schema.x, y: schema.y },
    vel: { x: schema.vx, y: schema.vy },
    facing: schema.facing === -1 ? -1 : 1,
    grounded: schema.grounded,
    coyoteTicks: schema.coyoteTicks,
    jumpBufferTicks: schema.jumpBufferTicks,
    dropThroughTicks: schema.dropThroughTicks,
    lastInputSeq: schema.lastProcessedSeq,
    weapon: isWeaponId(schema.weapon) ? schema.weapon : WEAPON_IDS.SWORD,
    action: isActionState(schema.action) ? schema.action : "Idle",
    actionTick: schema.actionTick,
    attackKind: isAttackKind(schema.attackKind) ? schema.attackKind : null,
    hp: schema.hp,
    stamina: schema.stamina,
    hitstunTicks: schema.hitstunTicks,
    invulnTicks: schema.invulnTicks,
    hitConfirmTicks: schema.hitConfirmTicks,
    comboCount: schema.comboCount,
    lastHitBy: schema.lastHitBy ? playerId(schema.lastHitBy) : null,
    lastHitTick: schema.lastHitTick,
    powerups: unflattenPowerups(schema.powerups),
    airJumpsUsed: schema.airJumpsUsed,
    ringOutArmorChargesUsed: schema.ringOutArmorChargesUsed,
  };
}
