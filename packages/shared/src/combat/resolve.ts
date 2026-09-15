import {
  BLOCK_DAMAGE_FRACTION,
  BLOCK_STUN_TICKS,
  GUARD_BROKEN_TICKS,
  HIT_CONFIRM_TICKS,
  MAX_HP,
  MAX_STAMINA,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from "../config/game.js";
import { overlaps, type AABB } from "../math/aabb.js";
import type { SimPlayer } from "../sim/types.js";
import type { PlayerId } from "../types/ids.js";
import { getAttack, getWeapon, hitboxWorldBox, type AttackDef } from "./weapons.js";

export type CombatEventType = "hit" | "blocked" | "guardBreak" | "ko" | "whiff";

export interface CombatEvent {
  type: CombatEventType;
  attacker: PlayerId;
  defender?: PlayerId;
}

export interface ResolveResult {
  players: Record<PlayerId, SimPlayer>;
  events: CombatEvent[];
}

interface PendingHit {
  attackerId: PlayerId;
  defenderId: PlayerId;
  attack: AttackDef;
  attackerFacing: 1 | -1;
}

function hurtbox(player: SimPlayer): AABB {
  return { x: player.pos.x, y: player.pos.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

function isFrontalBlock(attacker: SimPlayer, defender: SimPlayer): boolean {
  const attackerIsRight = attacker.pos.x >= defender.pos.x;
  const requiredFacing = attackerIsRight ? 1 : -1;
  return defender.facing === requiredFacing;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Every attacker's active hitboxes this tick, sorted by attacker id — the
 * plan's "test hurtboxes ... in sorted PlayerId order and compute every hit
 * before applying any" (Phase 4 step 3's resolve.ts stages 3-4). Dead
 * players and anyone outside AttackActive contribute nothing.
 */
function gatherPendingHits(players: Readonly<Record<PlayerId, SimPlayer>>): PendingHit[] {
  const ids = (Object.keys(players) as PlayerId[]).sort();
  const hits: PendingHit[] = [];

  for (const attackerId of ids) {
    const attacker = players[attackerId]!;
    if (attacker.action !== "AttackActive" || attacker.attackKind === null) {
      continue;
    }
    const weapon = getWeapon(attacker.weapon);
    const attack = getAttack(weapon, attacker.attackKind);
    const activeHitboxes = attack.hitboxes.filter((hb) => hb.tickOffset === attacker.actionTick);
    if (activeHitboxes.length === 0) {
      continue;
    }

    let landedAny = false;
    for (const defenderId of ids) {
      if (defenderId === attackerId) {
        continue;
      }
      const defender = players[defenderId]!;
      if (defender.action === "Dead") {
        continue;
      }
      const defenderBox = hurtbox(defender);
      const connects = activeHitboxes.some((hb) =>
        overlaps(hitboxWorldBox(attacker.pos, attacker.facing, hb.box), defenderBox),
      );
      if (connects) {
        landedAny = true;
        hits.push({ attackerId, defenderId, attack, attackerFacing: attacker.facing });
      }
    }
    if (!landedAny) {
      hits.push({ attackerId, defenderId: attackerId, attack, attackerFacing: attacker.facing });
    }
  }

  return hits;
}

/** Applies knockback mirrored by the attacker's facing — the defender's own
 *  facing never enters into it (plan: "knockback direction follows attacker
 *  facing"). */
function knockbackVel(attack: AttackDef, attackerFacing: 1 | -1): { x: number; y: number } {
  return { x: attackerFacing === 1 ? attack.knockback.x : -attack.knockback.x, y: attack.knockback.y };
}

/**
 * Stages 4-9 of `GameSimulation.step` (plan Phase 4 step 3): tests every
 * attacker's active hitboxes against every other player's hurtbox, then
 * applies dodge i-frames, block, damage, knockback, hitstun, and KO — all
 * from state gathered before any of it is applied, so simultaneous trades
 * come out the same regardless of which player's hit is processed first.
 */
export function resolveCombat(
  players: Readonly<Record<PlayerId, SimPlayer>>,
): ResolveResult {
  const pending = gatherPendingHits(players);
  const next: Record<PlayerId, SimPlayer> = { ...players };
  const events: CombatEvent[] = [];

  for (const { attackerId, defenderId, attack, attackerFacing } of pending) {
    if (defenderId === attackerId) {
      events.push({ type: "whiff", attacker: attackerId });
      continue;
    }

    const defender = players[defenderId]!;
    const attacker = players[attackerId]!;

    if (defender.invulnTicks > 0) {
      // Dodge i-frames skip the hit entirely — no damage, no event.
      continue;
    }

    const blocked = defender.action === "Block" && isFrontalBlock(attacker, defender);
    const current = next[defenderId]!;

    if (blocked) {
      const damage = attack.damage * BLOCK_DAMAGE_FRACTION;
      const stamina = current.stamina - attack.staminaDamage;
      const guardBroken = stamina <= 0;
      const vel = knockbackVel(attack, attackerFacing);

      next[defenderId] = {
        ...current,
        hp: clamp(current.hp - damage, 0, MAX_HP),
        stamina: clamp(stamina, 0, MAX_STAMINA),
        action: guardBroken ? "GuardBroken" : "BlockStun",
        actionTick: 0,
        attackKind: null,
        comboCount: 0,
        hitstunTicks: guardBroken ? GUARD_BROKEN_TICKS : BLOCK_STUN_TICKS,
        vel,
      };
      events.push({ type: guardBroken ? "guardBreak" : "blocked", attacker: attackerId, defender: defenderId });
      continue;
    }

    const hp = clamp(current.hp - attack.damage, 0, MAX_HP);
    const dead = hp <= 0;
    const vel = knockbackVel(attack, attackerFacing);

    next[defenderId] = {
      ...current,
      hp,
      action: dead ? "Dead" : "HitStun",
      actionTick: 0,
      attackKind: null,
      comboCount: 0,
      hitstunTicks: dead ? 0 : attack.hitstun,
      invulnTicks: 0,
      vel,
    };
    events.push({ type: "hit", attacker: attackerId, defender: defenderId });
    if (dead) {
      events.push({ type: "ko", attacker: attackerId, defender: defenderId });
    } else {
      next[attackerId] = { ...next[attackerId]!, hitConfirmTicks: HIT_CONFIRM_TICKS };
    }
  }

  return { players: next, events };
}
