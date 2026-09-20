import { getWeapon } from "../combat/weapons.js";
import type { ActionState, AttackKind } from "../combat/types.js";
import { DODGE_STAMINA_COST, PLAYER_HEIGHT, PLAYER_WIDTH } from "../config/game.js";
import { encode, type InputBitName, type InputFrame } from "../input/bitmask.js";
import { hashSeed, mulberry32, type Rng } from "../math/rng.js";
import type { SimPlayer, SimState } from "../sim/types.js";
import type { PlayerId } from "../types/ids.js";
import { BOT_TIERS, type BotKind, type BotParams } from "./tiers.js";
import { footingAhead, MAX_HOP_RISE, nextStepStone, standingOnPlatform } from "./terrain.js";

/** What a bot remembers of another player: enough to react to their swing a beat late. */
interface Observation {
  readonly action: ActionState;
  readonly attackKind: AttackKind | null;
  readonly actionTick: number;
  readonly x: number;
  readonly y: number;
}

type Plan =
  | { kind: "block"; untilTick: number }
  | { kind: "dodge"; untilTick: number }
  /** A noticed swing the bot chose not to answer (or botched): do not re-roll every tick. */
  | { kind: "ignore"; untilTick: number };

/** States from which a player cannot act on input, so the brain need not think. */
const HELPLESS: ReadonlySet<ActionState> = new Set(["Dead", "HitStun", "GuardBroken"]);
/** States a bot may start an attack from. */
const FREE: ReadonlySet<ActionState> = new Set(["Idle", "Run", "Airborne"]);
/** The most history a bot ever needs: the slowest tier's reaction plus one. */
const HISTORY_LIMIT = 32;
/** How long a guard raised on a hunch, or against a noticed swing, is held at least. */
const GUARD_HOLD_TICKS = 18;
const MIN_BLOCK_STAMINA = 15;
/** Vertical gap beyond which the bot treats the target as being on another level. */
const LEVEL_TOLERANCE = 70;
/** Horizontal distance at which a bot counts itself "under" a target on a platform above it. */
const UNDER_RANGE = 60;
/** Below this speed, while asking to run, a bot is up against something solid. */
const WALL_SPEED = 20;
/** How long a purposeful jump keeps the bot steering toward its target (a full jump's airtime, ~45 ticks). */
const HOP_TICKS = 45;
/** How far off (horizontally) a target below is still worth dropping through a platform for. */
const DROP_RANGE = 220;
/** Extra reach the bot allows itself when deciding it is close enough to swing. */
const SWING_SLACK = 6;
/**
 * Closer than this (centre to centre) a swing cannot land: a right-facing hitbox starts at the
 * attacker's leading edge but a left-facing one is mirrored about the body's origin, leaving a
 * dead zone beside it, so a bot standing inside a target hits nothing. It backs off first.
 */
const MIN_STAND = 40;
/** A hop over a target with no room behind us: just far enough to land on its far side. */
const RETREAT_HOP_TICKS = 14;
/** Once backing off, keep going until this far (a little hysteresis, so it does not shuffle). */
const RETREAT_UNTIL = 52;

/** The bot's own face at the target: a bot cannot turn and swing in the same tick (locomotion locks
 *  the moment an attack starts), so it turns first. */
function directionTo(from: SimPlayer, to: SimPlayer): -1 | 1 {
  return to.pos.x >= from.pos.x ? 1 : -1;
}

function observe(player: SimPlayer): Observation {
  return {
    action: player.action,
    attackKind: player.attackKind,
    actionTick: player.actionTick,
    x: player.pos.x,
    y: player.pos.y,
  };
}

function isThreatening(observed: Observation): boolean {
  return observed.action === "AttackStartup" || observed.action === "AttackActive";
}

/**
 * One bot's mind. `decide(sim)` is called once per tick with the state at the end of the previous
 * tick and returns that tick's `InputFrame`; the caller pushes it where a human's input would go
 * (ADR 0003). It reads no clock and draws only from an RNG seeded by (seed, tick), so the same
 * sequence of states always yields the same frames and a replay is exact.
 *
 * It is deliberately not a pathfinder: it closes distance, keeps a swinging range, answers a swing
 * it noticed (after its reaction delay, and not always), presses an advantage, and steers clear of
 * hazards and ledges. Difficulty is `BotParams`, nothing else.
 */
export class BotBrain {
  readonly id: PlayerId;
  readonly kind: BotKind;
  readonly #params: BotParams | null;
  readonly #seed: number;
  #seq = 0;
  #plan: Plan | null = null;
  #history: Record<string, Observation>[] = [];
  /** The swing (start tick) the current plan was rolled for, so one swing is decided once. */
  #answeredSwing: string | null = null;
  /** Backing away from a target it is standing inside (see `MIN_STAND`). */
  #retreating = false;
  /** Whether the last frame asked to run: with no speed to show for it, the bot is against a wall. */
  #pushedLastTick = false;
  /** While a purposeful jump is in the air (until this tick), keep holding JUMP for full height. */
  #hopUntilTick = 0;
  /** Which way that jump leans (toward the target, or toward the stepping stone it is aiming at). */
  #hopDir: -1 | 1 = 1;

  constructor(id: PlayerId, kind: BotKind, seed: number) {
    this.id = id;
    this.kind = kind;
    this.#params = kind === "dummy" ? null : BOT_TIERS[kind];
    this.#seed = seed;
  }

  decide(sim: SimState): InputFrame {
    const seq = ++this.#seq;
    const self = sim.players[this.id];
    if (!self) {
      return { seq, bits: 0 };
    }
    const params = this.#params;
    if (!params) {
      return { seq, bits: 0 };
    }

    this.#remember(sim);
    if (HELPLESS.has(self.action)) {
      this.#plan = null;
      return { seq, bits: 0 };
    }

    const target = this.#pickTarget(sim, self);
    if (!target) {
      return { seq, bits: 0 };
    }

    const rng = mulberry32(hashSeed(this.#seed, sim.tick));
    const names = this.#think(sim, self, target, params, rng);
    this.#pushedLastTick = names.includes("LEFT") || names.includes("RIGHT");
    return { seq, bits: encode(names) };
  }

  #remember(sim: SimState): void {
    const snapshot: Record<string, Observation> = {};
    for (const [id, player] of Object.entries(sim.players)) {
      if (id !== this.id) {
        snapshot[id] = observe(player);
      }
    }
    this.#history.push(snapshot);
    if (this.#history.length > HISTORY_LIMIT) {
      this.#history.shift();
    }
  }

  /** What `id` looked like `reactionTicks` ago (or the oldest the bot remembers). */
  #delayed(id: string, reactionTicks: number): Observation | undefined {
    const index = Math.max(0, this.#history.length - 1 - reactionTicks);
    return this.#history[index]?.[id];
  }

  #pickTarget(sim: SimState, self: SimPlayer): { id: PlayerId; player: SimPlayer } | null {
    let best: { id: PlayerId; player: SimPlayer } | null = null;
    let bestDistance = Infinity;
    for (const [id, player] of Object.entries(sim.players) as [PlayerId, SimPlayer][]) {
      if (id === this.id || player.action === "Dead") {
        continue;
      }
      const distance = Math.hypot(player.pos.x - self.pos.x, (player.pos.y - self.pos.y) * 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { id, player };
      }
    }
    return best;
  }

  #think(
    sim: SimState,
    self: SimPlayer,
    target: { id: PlayerId; player: SimPlayer },
    params: BotParams,
    rng: Rng,
  ): InputBitName[] {
    const tick = sim.tick;
    const weapon = getWeapon(self.weapon);
    const seen = this.#delayed(target.id, params.reactionTicks) ?? observe(target.player);
    const dx = target.player.pos.x - self.pos.x;
    const dy = target.player.pos.y - self.pos.y;
    const dir = directionTo(self, target.player);
    const dist = Math.abs(dx);
    const sameLevel = Math.abs(dy) <= LEVEL_TOLERANCE;
    const swingMax = weapon.reach + PLAYER_WIDTH - SWING_SLACK;
    const abreast = Math.abs(dy) <= PLAYER_HEIGHT;
    const inSwingRange = dist >= MIN_STAND && dist <= swingMax && abreast;
    const names: InputBitName[] = [];

    // A plan already in force is followed to its end (a guard that flickered every tick is no guard).
    if (this.#plan && tick >= this.#plan.untilTick) {
      this.#plan = null;
    }

    // Notice a swing that is coming at us, once, after the reaction delay.
    if (isThreatening(seen) && dist <= weapon.reach + PLAYER_WIDTH + 60 && sameLevel) {
      const swing = `${target.id}:${tick - seen.actionTick}`;
      if (this.#answeredSwing !== swing && !this.#plan) {
        this.#answeredSwing = swing;
        this.#plan = this.#answer(self, params, rng, tick);
      }
    } else if (!this.#plan && self.grounded && inSwingRange && rng() < params.guardHunch) {
      this.#plan = { kind: "block", untilTick: tick + GUARD_HOLD_TICKS };
    }

    if (this.#plan?.kind === "dodge" && self.stamina >= DODGE_STAMINA_COST) {
      return ["DODGE"];
    }
    if (this.#plan?.kind === "block" && self.grounded && self.stamina >= MIN_BLOCK_STAMINA) {
      names.push("BLOCK");
      return names;
    }

    const facing = self.facing;
    const free = FREE.has(self.action);

    // Standing inside the target: no swing can land from here, so back off (or hop past if a ledge
    // is behind us) before doing anything else.
    if (dist < MIN_STAND && abreast) {
      this.#retreating = true;
    } else if (dist >= RETREAT_UNTIL || !abreast) {
      this.#retreating = false;
    }
    if (this.#retreating && free && self.grounded) {
      const away: -1 | 1 = dir === 1 ? -1 : 1;
      const walledIn = this.#pushedLastTick && Math.abs(self.vel.x) < WALL_SPEED;
      if (walledIn || footingAhead(sim, self.pos, away).blocked) {
        // No room behind us (a wall, a ledge): hop over them and turn round on the far side.
        this.#hop(tick, dir, RETREAT_HOP_TICKS);
        names.push("JUMP", dir === 1 ? "RIGHT" : "LEFT");
      } else {
        names.push(away === 1 ? "RIGHT" : "LEFT");
      }
      return names;
    }

    // Turn to face the target before anything else: a swing thrown the wrong way is a wasted one.
    if (inSwingRange && facing !== dir && free) {
      names.push(dir === 1 ? "RIGHT" : "LEFT");
      return names;
    }

    // Chain a light off a landed hit.
    if (
      params.punishes &&
      self.action === "AttackRecovery" &&
      self.hitConfirmTicks > 0 &&
      inSwingRange
    ) {
      names.push("LIGHT");
      return names;
    }

    if (free && inSwingRange && facing === dir) {
      const attack = this.#chooseAttack(seen, params, rng);
      if (attack) {
        names.push(attack);
        return names;
      }
    }

    // Movement: the vertical problem first (a target on another level), then plain closing.
    this.#move(sim, self, target.player, dir, dist, dy, swingMax, rng, names);
    return names;
  }

  /** Starts a purposeful jump: JUMP stays held (and the lean kept) until it is done. */
  #hop(tick: number, lean: -1 | 1, ticks = HOP_TICKS): void {
    this.#hopUntilTick = tick + ticks;
    this.#hopDir = lean;
  }

  /** Decides how to answer one noticed swing. */
  #answer(self: SimPlayer, params: BotParams, rng: Rng, tick: number): Plan {
    if (rng() < params.errorRate) {
      return { kind: "ignore", untilTick: tick + GUARD_HOLD_TICKS };
    }
    const roll = rng();
    if (roll < params.blockChance && self.grounded && self.stamina >= MIN_BLOCK_STAMINA) {
      return { kind: "block", untilTick: tick + GUARD_HOLD_TICKS };
    }
    if (roll < params.blockChance + params.dodgeChance && self.stamina >= DODGE_STAMINA_COST) {
      return { kind: "dodge", untilTick: tick + 2 };
    }
    return { kind: "ignore", untilTick: tick + GUARD_HOLD_TICKS };
  }

  #chooseAttack(seen: Observation, params: BotParams, rng: Rng): InputBitName | null {
    const vulnerable =
      seen.action === "HitStun" ||
      seen.action === "GuardBroken" ||
      seen.action === "AttackRecovery";
    const guarding = seen.action === "Block" || seen.action === "BlockStun";
    if (params.punishes && vulnerable) {
      // An opening: take it (heavy when they cannot answer, since it lands harder).
      return seen.action === "AttackRecovery" ? "LIGHT" : "HEAVY";
    }
    if (rng() >= params.attackRate) {
      return null;
    }
    if (rng() < params.errorRate) {
      // A botched decision: the swing never comes.
      return null;
    }
    // Heavies break a guard; against an open target a mix.
    const heavy = guarding ? rng() < 0.6 : rng() < params.heavyShare;
    return heavy ? "HEAVY" : "LIGHT";
  }

  #move(
    sim: SimState,
    self: SimPlayer,
    target: SimPlayer,
    dir: -1 | 1,
    dist: number,
    dy: number,
    swingMax: number,
    rng: Rng,
    names: InputBitName[],
  ): void {
    if (!FREE.has(self.action)) {
      return;
    }
    if (!self.grounded && sim.tick < this.#hopUntilTick) {
      // Mid-way through a jump we chose: JUMP must stay held while rising or the hop is cut short.
      names.push(this.#hopDir === 1 ? "RIGHT" : "LEFT");
      if (self.vel.y < 0) {
        names.push("JUMP");
      }
      return;
    }
    const below = dy > LEVEL_TOLERANCE;
    const above = dy < -LEVEL_TOLERANCE;

    if (
      below &&
      self.grounded &&
      standingOnPlatform(sim, self.pos) &&
      Math.abs(target.pos.x - self.pos.x) < DROP_RANGE
    ) {
      // Drop through the platform we stand on to reach them.
      names.push("DOWN", "JUMP");
      return;
    }

    // On another level "close enough to swing" is beside the point: get under or over them first.
    const wantsToClose = below || above ? dist > UNDER_RANGE / 2 : dist > swingMax - 14;
    if (above && self.grounded) {
      // They are higher up. Either we are under them (a one-way platform passes a jump from below) or
      // pressed against the riser they stand on: hop, leaning toward them to land on top.
      const under = Math.abs(target.pos.x - self.pos.x) < UNDER_RANGE;
      const againstWall = this.#pushedLastTick && Math.abs(self.vel.x) < WALL_SPEED;
      if (-dy <= MAX_HOP_RISE) {
        if (under || againstWall) {
          this.#hop(sim.tick, dir);
          names.push("JUMP", dir === 1 ? "RIGHT" : "LEFT");
          return;
        }
      } else {
        // Too high for one jump: work up through whatever stands between (a stair, a ledge).
        const stone = nextStepStone(sim, self.pos, target.pos.y + PLAYER_HEIGHT);
        if (stone) {
          const toward: -1 | 1 = stone.aimX >= self.pos.x ? 1 : -1;
          // One-way platform: anywhere under it will do. Solid: hop off its wall, leaning into it.
          const beneath =
            stone.oneWay && self.pos.x >= stone.left - 6 && self.pos.x <= stone.right + 6;
          const atWall = !stone.oneWay && Math.abs(self.pos.x - stone.aimX) < 14;
          if (beneath || atWall || againstWall) {
            const lean: -1 | 1 = stone.oneWay ? toward : stone.aimX <= stone.left ? 1 : -1;
            this.#hop(sim.tick, beneath ? toward : lean);
            names.push("JUMP", this.#hopDir === 1 ? "RIGHT" : "LEFT");
          } else {
            names.push(toward === 1 ? "RIGHT" : "LEFT");
          }
          return;
        }
      }
    }

    if (wantsToClose) {
      if (self.grounded) {
        const footing = footingAhead(sim, self.pos, dir);
        if (footing.blocked) {
          if (footing.canLeap) {
            this.#hop(sim.tick, dir);
            names.push("JUMP", dir === 1 ? "RIGHT" : "LEFT");
          }
          // otherwise wait at the edge: stepping off is worse than standing still
          return;
        }
      }
      names.push(dir === 1 ? "RIGHT" : "LEFT");
      // An occasional hop keeps a bot from being a sitting duck to a grounded poke.
      if (self.grounded && rng() < 0.01) {
        names.push("JUMP");
      }
    }
  }
}
