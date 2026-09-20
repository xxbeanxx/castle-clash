import { describe, expect, it } from "vitest";
import { BLOCK_DAMAGE_FRACTION, MAX_HP, MAX_STAMINA } from "../config/game.js";
import { createSimPlayer, type SimPlayer } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import { resolveCombat } from "./resolve.js";
import { WEAPONS } from "./weapons.js";

const A = playerId("a");
const B = playerId("b");

function player(x: number, overrides: Partial<SimPlayer> = {}): SimPlayer {
  return { ...createSimPlayer({ x, y: 0 }), grounded: true, ...overrides };
}

function attackerAt(x: number, overrides: Partial<SimPlayer> = {}): SimPlayer {
  return player(x, { action: "AttackActive", actionTick: 0, attackKind: "light", ...overrides });
}

describe("resolveCombat — reach", () => {
  it("a spear light connects at 100px but a sword light whiffs", () => {
    const spearAttacker = attackerAt(0, { weapon: "spear" });
    const swordAttacker = attackerAt(0, { weapon: "sword" });
    const defender = player(100);

    const spearResult = resolveCombat({ [A]: spearAttacker, [B]: defender });
    expect(spearResult.events).toContainEqual({ type: "hit", attacker: A, defender: B });
    expect(spearResult.players[B]!.hp).toBeLessThan(MAX_HP);

    const swordResult = resolveCombat({ [A]: swordAttacker, [B]: defender });
    expect(swordResult.events).toContainEqual({ type: "whiff", attacker: A });
    expect(swordResult.players[B]!.hp).toBe(MAX_HP);
  });
});

describe("resolveCombat — block", () => {
  it("frontal block reduces damage and drains stamina", () => {
    const attacker = attackerAt(0, { weapon: "sword", facing: 1 });
    const defender = player(50, { action: "Block", facing: -1 });

    const result = resolveCombat({ [A]: attacker, [B]: defender });
    const expectedDamage = WEAPONS.sword.light.damage * BLOCK_DAMAGE_FRACTION;

    expect(result.events).toContainEqual({ type: "blocked", attacker: A, defender: B });
    expect(result.players[B]!.hp).toBe(MAX_HP - expectedDamage);
    expect(result.players[B]!.stamina).toBe(MAX_STAMINA - WEAPONS.sword.light.staminaDamage);
    expect(result.players[B]!.action).toBe("BlockStun");
  });

  it("a hit from behind ignores block", () => {
    const attacker = attackerAt(0, { weapon: "sword", facing: 1 });
    // Defender faces the same way as the attacker (away from them), so the
    // attacker is behind, not in front.
    const defender = player(50, { action: "Block", facing: 1 });

    const result = resolveCombat({ [A]: attacker, [B]: defender });

    expect(result.events).toContainEqual({ type: "hit", attacker: A, defender: B });
    expect(result.players[B]!.hp).toBe(MAX_HP - WEAPONS.sword.light.damage);
    expect(result.players[B]!.action).toBe("HitStun");
  });
});

describe("resolveCombat — dodge i-frames", () => {
  it("skips the hit while invulnTicks > 0", () => {
    const attacker = attackerAt(0, { weapon: "sword" });
    const defender = player(50, { action: "Dodge", invulnTicks: 1 });

    const result = resolveCombat({ [A]: attacker, [B]: defender });

    expect(result.events).not.toContainEqual(expect.objectContaining({ type: "hit" }));
    expect(result.players[B]!.hp).toBe(MAX_HP);
  });

  it("takes the hit once invulnTicks reaches 0", () => {
    const attacker = attackerAt(0, { weapon: "sword" });
    const defender = player(50, { action: "Dodge", invulnTicks: 0 });

    const result = resolveCombat({ [A]: attacker, [B]: defender });

    expect(result.events).toContainEqual({ type: "hit", attacker: A, defender: B });
    expect(result.players[B]!.hp).toBeLessThan(MAX_HP);
  });
});

describe("resolveCombat — guard break", () => {
  it("a mace heavy against a block at low stamina causes GuardBroken", () => {
    const attacker = attackerAt(0, {
      weapon: "mace",
      attackKind: "heavy",
      facing: 1,
    });
    const defender = player(50, { action: "Block", facing: -1, stamina: 10 });

    const result = resolveCombat({ [A]: attacker, [B]: defender });

    expect(result.events).toContainEqual({ type: "guardBreak", attacker: A, defender: B });
    expect(result.players[B]!.action).toBe("GuardBroken");
    expect(result.players[B]!.stamina).toBe(0);
  });
});

describe("resolveCombat — knockback", () => {
  it("follows the attacker's facing, not the defender's", () => {
    const defender = player(50);

    const rightFacing = resolveCombat({
      [A]: attackerAt(0, { weapon: "sword", facing: 1 }),
      [B]: defender,
    });
    expect(rightFacing.players[B]!.vel.x).toBeGreaterThan(0);

    const leftFacing = resolveCombat({
      [A]: attackerAt(70, { weapon: "sword", facing: -1 }),
      [B]: player(20),
    });
    expect(leftFacing.players[B]!.vel.x).toBeLessThan(0);
  });
});

describe("resolveCombat — simultaneous trades", () => {
  it("produces identical results regardless of player iteration order", () => {
    const attackerA = attackerAt(0, { weapon: "sword", facing: 1 });
    const attackerB = attackerAt(50, { weapon: "sword", facing: -1 });

    const forward = resolveCombat({ [A]: attackerA, [B]: attackerB });
    const reversed = resolveCombat({ [B]: attackerB, [A]: attackerA });

    expect(forward.players[A]).toEqual(reversed.players[A]);
    expect(forward.players[B]).toEqual(reversed.players[B]);
    expect(forward.events.length).toBe(reversed.events.length);
  });
});

describe("resolveCombat — KO", () => {
  it("marks a player Dead and emits a ko event when hp reaches 0", () => {
    const attacker = attackerAt(0, { weapon: "mace", attackKind: "heavy", facing: 1 });
    const defender = player(30, { hp: 5 });

    const result = resolveCombat({ [A]: attacker, [B]: defender });

    expect(result.players[B]!.hp).toBe(0);
    expect(result.players[B]!.action).toBe("Dead");
    expect(result.events).toContainEqual({ type: "ko", attacker: A, defender: B });
  });

  it("Dead players deal no damage and take no more hits", () => {
    const attacker = attackerAt(0, { weapon: "sword", action: "Dead" });
    const defender = player(30, { action: "Dead", hp: 0 });

    const result = resolveCombat({ [A]: attacker, [B]: defender });

    expect(result.events).toEqual([]);
    expect(result.players[B]!.hp).toBe(0);
  });
});

describe("resolveCombat — damage multiplier (sudden death)", () => {
  it("scales a clean hit's damage", () => {
    const attacker = attackerAt(0, { weapon: "sword", facing: 1 });
    const defender = player(50, { facing: -1 });

    const normal = resolveCombat({ [A]: attacker, [B]: defender });
    const doubled = resolveCombat({ [A]: attacker, [B]: defender }, {}, {}, 2);

    expect(MAX_HP - normal.players[B]!.hp).toBe(WEAPONS.sword.light.damage);
    expect(MAX_HP - doubled.players[B]!.hp).toBe(WEAPONS.sword.light.damage * 2);
  });

  it("scales a blocked hit's chip damage but not its stamina cost", () => {
    const attacker = attackerAt(0, { weapon: "sword", facing: 1 });
    const defender = player(50, { action: "Block", facing: -1 });

    const doubled = resolveCombat({ [A]: attacker, [B]: defender }, {}, {}, 2);

    expect(MAX_HP - doubled.players[B]!.hp).toBe(
      WEAPONS.sword.light.damage * 2 * BLOCK_DAMAGE_FRACTION,
    );
    expect(MAX_STAMINA - doubled.players[B]!.stamina).toBe(WEAPONS.sword.light.staminaDamage);
  });

  it("makes a hit lethal that would not have been", () => {
    const attacker = attackerAt(0, { weapon: "sword", facing: 1 });
    const defender = player(50, { facing: -1, hp: WEAPONS.sword.light.damage + 1 });

    const normal = resolveCombat({ [A]: attacker, [B]: defender });
    const doubled = resolveCombat({ [A]: attacker, [B]: defender }, {}, {}, 2);

    expect(normal.events.some((event) => event.type === "ko")).toBe(false);
    expect(doubled.events).toContainEqual({ type: "ko", attacker: A, defender: B });
    expect(doubled.players[B]!.action).toBe("Dead");
  });
});
