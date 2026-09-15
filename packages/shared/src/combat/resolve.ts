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
import type { Vec } from "../math/vec.js";
import type { SimPlayer } from "../sim/types.js";
import type { PlayerId } from "../types/ids.js";
import type { ActionState } from "./types.js";
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

/** An attacker's active hitbox either connected with a defender or found
 *  nobody there — an explicit discriminant instead of a `defenderId ===
 *  attackerId` sentinel, so the two cases can't be mixed up downstream. */
type PendingHit =
  | { kind: "whiff"; attackerId: PlayerId }
  | {
      kind: "attack";
      attackerId: PlayerId;
      defenderId: PlayerId;
      attack: AttackDef;
      attackerFacing: 1 | -1;
    };

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
        hits.push({ kind: "attack", attackerId, defenderId, attack, attackerFacing: attacker.facing });
      }
    }
    if (!landedAny) {
      hits.push({ kind: "whiff", attackerId });
    }
  }

  return hits;
}

/** Applies knockback mirrored by the attacker's facing — the defender's own
 *  facing never enters into it (plan: "knockback direction follows attacker
 *  facing"). */
function knockbackVel(attack: AttackDef, attackerFacing: 1 | -1): Vec {
  return { x: attackerFacing === 1 ? attack.knockback.x : -attack.knockback.x, y: attack.knockback.y };
}

/** The parts of a defender's outcome that differ between a full hit and a
 *  blocked one — everything else (actionTick reset, clearing attackKind/
 *  comboCount, dropping any leftover invuln) is the same either way, so
 *  it's enforced once here rather than duplicated per branch. */
function applyHitOutcome(
  current: SimPlayer,
  outcome: { action: ActionState; hitstunTicks: number; hp: number; stamina: number; vel: Vec },
): SimPlayer {
  return {
    ...current,
    hp: outcome.hp,
    stamina: outcome.stamina,
    action: outcome.action,
    actionTick: 0,
    attackKind: null,
    comboCount: 0,
    hitstunTicks: outcome.hitstunTicks,
    invulnTicks: 0,
    vel: outcome.vel,
  };
}

/**
 * Stages 4-9 of `GameSimulation.step` (plan Phase 4 step 3): tests every
 * attacker's active hitboxes against every other player's hurtbox, then
 * applies dodge i-frames, block, damage, knockback, hitstun, and KO — all
 * from state gathered before any of it is applied, so simultaneous trades
 * come out the same regardless of which player's hit is processed first.
 *
 * No lag compensation yet: hitboxes and hurtboxes are tested against the
 * server's current-tick positions, not rewound to what the attacker's
 * client actually saw. `docs/research/phase4-colyseus-rewind-lag-
 * compensation.md` found `Room.allowRewindState()`/`Rewind` ready to adopt
 * for this incrementally (unlike `defineInput`/`predict.*`, it doesn't
 * require swapping the input transport) and recommends doing so — deferred
 * here the same way Phase 3 deferred the built-in prediction framework:
 * the plan's Phase 4 gate and tests don't exercise it, and at this sim's
 * scale (≤ 8 players, dev/LAN latency) the gap isn't yet visible. A later
 * phase adding real network latency handling should pick this back up
 * rather than treating its absence as settled.
 */
export function resolveCombat(
  players: Readonly<Record<PlayerId, SimPlayer>>,
): ResolveResult {
  const pending = gatherPendingHits(players);
  const next: Record<PlayerId, SimPlayer> = { ...players };
  const events: CombatEvent[] = [];

  for (const hit of pending) {
    if (hit.kind === "whiff") {
      events.push({ type: "whiff", attacker: hit.attackerId });
      continue;
    }

    const { attackerId, defenderId, attack, attackerFacing } = hit;
    const defender = players[defenderId]!;
    const attacker = players[attackerId]!;

    if (defender.invulnTicks > 0) {
      // Dodge i-frames skip the hit entirely — no damage, no event.
      continue;
    }

    const blocked = defender.action === "Block" && isFrontalBlock(attacker, defender);
    const current = next[defenderId]!;
    const vel = knockbackVel(attack, attackerFacing);

    if (blocked) {
      const stamina = current.stamina - attack.staminaDamage;
      const guardBroken = stamina <= 0;

      next[defenderId] = applyHitOutcome(current, {
        action: guardBroken ? "GuardBroken" : "BlockStun",
        hitstunTicks: guardBroken ? GUARD_BROKEN_TICKS : BLOCK_STUN_TICKS,
        hp: clamp(current.hp - attack.damage * BLOCK_DAMAGE_FRACTION, 0, MAX_HP),
        stamina: clamp(stamina, 0, MAX_STAMINA),
        vel,
      });
      events.push({
        type: guardBroken ? "guardBreak" : "blocked",
        attacker: attackerId,
        defender: defenderId,
      });
      continue;
    }

    const hp = clamp(current.hp - attack.damage, 0, MAX_HP);
    const dead = hp <= 0;

    next[defenderId] = applyHitOutcome(current, {
      action: dead ? "Dead" : "HitStun",
      hitstunTicks: dead ? 0 : attack.hitstun,
      hp,
      stamina: current.stamina,
      vel,
    });
    events.push({ type: "hit", attacker: attackerId, defender: defenderId });
    if (dead) {
      events.push({ type: "ko", attacker: attackerId, defender: defenderId });
    } else {
      next[attackerId] = { ...next[attackerId]!, hitConfirmTicks: HIT_CONFIRM_TICKS };
    }
  }

  return { players: next, events };
}
