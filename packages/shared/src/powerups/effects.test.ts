import { getWeapon } from "../combat/weapons.js";
import { resolveCombat } from "../combat/resolve.js";
import { MAX_HP } from "../config/game.js";
import { encode } from "../input/bitmask.js";
import { createHazardState } from "../hazards/step.js";
import type { HazardDef } from "../hazards/types.js";
import { step } from "../sim/GameSimulation.js";
import { createSimPlayer, type SimPlayer, type SimState } from "../sim/types.js";
import { playerId } from "../types/ids.js";
import { describe, expect, it } from "vitest";
import { computeStats } from "./computeStats.js";
import { BASE_STATS } from "./computeStats.js";
import { powerUpId } from "./types.js";

const A = playerId("a");
const B = playerId("b");
const SWORD = getWeapon("sword");

function attackerAt(x: number, overrides: Partial<SimPlayer> = {}): SimPlayer {
  return {
    ...createSimPlayer({ x, y: 0 }),
    grounded: true,
    action: "AttackActive",
    actionTick: 0,
    attackKind: "light",
    ...overrides,
  };
}

function player(x: number, overrides: Partial<SimPlayer> = {}): SimPlayer {
  return { ...createSimPlayer({ x, y: 0 }), grounded: true, ...overrides };
}

function modifiersFor(player: SimPlayer) {
  const stats = computeStats(BASE_STATS, SWORD, player.powerups ?? {});
  return {
    maxHp: stats.maxHp,
    staminaMax: stats.staminaMax,
    blockStaminaCostMultiplier: stats.blockStaminaCostMultiplier,
    knockbackResistFraction: stats.knockbackResistFraction,
    lifestealPct: stats.effects.lifestealPct,
    thornsPct: stats.effects.thornsPct,
  };
}

const VAMPIRIC_EDGE = powerUpId("vampiricEdge");
const SPIKED_ARMOR = powerUpId("spikedArmor");
const AERIALIST_BOOTS = powerUpId("aerialistBoots");
const EMBER_WARD = powerUpId("emberWard");
const GUARDIAN_CHARM = powerUpId("guardianCharm");

describe("lifesteal", () => {
  it("heals the attacker by pct of the damage dealt, never above maxHp", () => {
    const attacker = attackerAt(0, { hp: 90, powerups: { [VAMPIRIC_EDGE]: 1 } });
    const defender = player(50);

    const result = resolveCombat(
      { [A]: attacker, [B]: defender },
      { [A]: SWORD, [B]: SWORD },
      { [A]: modifiersFor(attacker), [B]: modifiersFor(defender) },
    );

    const damageDealt = MAX_HP - result.players[B]!.hp;
    expect(result.players[A]!.hp).toBe(Math.min(MAX_HP, 90 + damageDealt * 0.1));
  });

  it("never heals the attacker above maxHp", () => {
    const attacker = attackerAt(0, { hp: MAX_HP, powerups: { [VAMPIRIC_EDGE]: 3 } });
    const defender = player(50);

    const result = resolveCombat(
      { [A]: attacker, [B]: defender },
      { [A]: SWORD, [B]: SWORD },
      { [A]: modifiersFor(attacker), [B]: modifiersFor(defender) },
    );

    expect(result.players[A]!.hp).toBe(MAX_HP);
  });
});

describe("thorns", () => {
  it("reflects pct of damage taken back onto the attacker", () => {
    const attacker = attackerAt(0, { hp: MAX_HP });
    const defender = player(50, { powerups: { [SPIKED_ARMOR]: 1 } });

    const result = resolveCombat(
      { [A]: attacker, [B]: defender },
      { [A]: SWORD, [B]: SWORD },
      { [A]: modifiersFor(attacker), [B]: modifiersFor(defender) },
    );

    const damageDealt = MAX_HP - result.players[B]!.hp;
    expect(result.players[A]!.hp).toBe(MAX_HP - damageDealt * 0.12);
  });

  it("never drops the attacker below 1 hp from thorns alone", () => {
    const attacker = attackerAt(0, { hp: 1 });
    const defender = player(50, { powerups: { [SPIKED_ARMOR]: 3 } });

    const result = resolveCombat(
      { [A]: attacker, [B]: defender },
      { [A]: SWORD, [B]: SWORD },
      { [A]: modifiersFor(attacker), [B]: modifiersFor(defender) },
    );

    expect(result.players[A]!.hp).toBeGreaterThanOrEqual(1);
  });
});

function airborneArena(hazards: readonly HazardDef[] = []): SimState["arena"] {
  return {
    id: "test",
    bounds: { x: 0, y: 0, w: 2000, h: 2000 },
    solids: [],
    platforms: [],
    spawns: [{ x: 500, y: 500 }],
    killZones: [{ x: 0, y: 1800, w: 2000, h: 200 }],
    hazards,
  };
}

describe("doubleJump", () => {
  it("allows exactly one extra jump before landing", () => {
    const airborne: SimPlayer = {
      ...createSimPlayer({ x: 100, y: 100 }),
      grounded: false,
      coyoteTicks: 0,
      jumpBufferTicks: 0,
      powerups: { [AERIALIST_BOOTS]: 1 },
    };
    let state: SimState = { tick: 0, players: { [A]: airborne }, arena: airborneArena(), rngSeed: 1 };

    const JUMP = encode(["JUMP"]);
    const first = step(state, { [A]: { seq: 1, bits: JUMP } });
    expect(first.events).toContainEqual({ type: "jump", playerId: A });
    expect(first.state.players[A]!.airJumpsUsed).toBe(1);
    expect(first.state.players[A]!.vel.y).toBeLessThan(0);
    state = first.state;

    // Still airborne, JUMP held again — the extra jump is already spent.
    const second = step(state, { [A]: { seq: 2, bits: JUMP } });
    expect(second.events).not.toContainEqual({ type: "jump", playerId: A });
    expect(second.state.players[A]!.airJumpsUsed).toBe(1);
  });

  it("resets the extra jump once grounded", () => {
    const grounded: SimPlayer = {
      ...createSimPlayer({ x: 100, y: 100 }),
      grounded: true,
      airJumpsUsed: 1,
      powerups: { [AERIALIST_BOOTS]: 1 },
    };
    const state: SimState = { tick: 0, players: { [A]: grounded }, arena: airborneArena(), rngSeed: 1 };
    const result = step(state, {});
    expect(result.state.players[A]!.airJumpsUsed).toBe(0);
  });
});

describe("fireImmune", () => {
  const FIRE_ZONE: HazardDef = { id: "fz", kind: "fireZone", box: { x: 0, y: 90, w: 200, h: 40 }, dps: 30 };

  it("ignores FireZone damage entirely", () => {
    const immune: SimPlayer = {
      ...createSimPlayer({ x: 50, y: 100 }),
      grounded: true,
      powerups: { [EMBER_WARD]: 1 },
    };
    const arena = airborneArena([FIRE_ZONE]);
    const state: SimState = {
      tick: 0,
      players: { [A]: immune },
      arena,
      rngSeed: 1,
      hazards: createHazardState(arena.hazards),
    };

    const result = step(state, {});
    expect(result.state.players[A]!.hp).toBe(MAX_HP);
  });

  it("a non-immune player standing in the same FireZone still takes damage", () => {
    const vulnerable: SimPlayer = { ...createSimPlayer({ x: 50, y: 100 }), grounded: true };
    const arena = airborneArena([FIRE_ZONE]);
    const state: SimState = {
      tick: 0,
      players: { [A]: vulnerable },
      arena,
      rngSeed: 1,
      hazards: createHazardState(arena.hazards),
    };

    const result = step(state, {});
    expect(result.state.players[A]!.hp).toBeLessThan(MAX_HP);
  });
});

describe("ringOutArmor", () => {
  it("consumes a charge instead of eliminating, and repositions to a spawn", () => {
    const armored: SimPlayer = {
      ...createSimPlayer({ x: 10, y: 1810 }),
      grounded: true,
      powerups: { [GUARDIAN_CHARM]: 1 },
    };
    const arena = airborneArena();
    const state: SimState = { tick: 0, players: { [A]: armored }, arena, rngSeed: 1 };

    const result = step(state, {});
    expect(result.events).toContainEqual({ type: "ringOutArmorUsed", playerId: A });
    expect(result.events).not.toContainEqual(expect.objectContaining({ type: "eliminated" }));
    expect(result.state.players[A]!.action).not.toBe("Dead");
    expect(result.state.players[A]!.ringOutArmorChargesUsed).toBe(1);
    expect(result.state.players[A]!.pos).toEqual(arena.spawns[0]);
  });

  it("eliminates normally once every charge is spent", () => {
    const spent: SimPlayer = {
      ...createSimPlayer({ x: 10, y: 1810 }),
      grounded: true,
      powerups: { [GUARDIAN_CHARM]: 1 },
      ringOutArmorChargesUsed: 1,
    };
    const arena = airborneArena();
    const state: SimState = { tick: 0, players: { [A]: spent }, arena, rngSeed: 1 };

    const result = step(state, {});
    expect(result.events).toContainEqual({ type: "eliminated", victim: A, cause: "killZone" });
    expect(result.state.players[A]!.action).toBe("Dead");
  });
});
