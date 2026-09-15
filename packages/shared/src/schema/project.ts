import { isActionState, isAttackKind } from "../combat/types.js";
import type { SimPlayer, SimState } from "../sim/types.js";
import { isWeaponId, WEAPON_IDS, type PlayerId } from "../types/ids.js";
import type { MatchState, PlayerState } from "./state.js";

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
    const ack = lastProcessedSeq[id];
    if (ack !== undefined) {
      schemaPlayer.lastProcessedSeq = ack;
    }
  }
}

/** The inverse of `projectToSchema` for one player — reconstructs the exact
 *  `SimPlayer` a client's `Reconciler` needs to replay pending inputs from. */
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
  };
}
