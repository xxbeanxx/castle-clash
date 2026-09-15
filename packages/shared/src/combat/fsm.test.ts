import { describe, expect, it } from "vitest";
import { DODGE_STAMINA_COST, MAX_STAMINA } from "../config/game.js";
import { encode, type InputBitName } from "../input/bitmask.js";
import { createSimPlayer } from "../sim/types.js";
import type { SimPlayer } from "../sim/types.js";
import { WEAPONS } from "./weapons.js";
import { applyFsm, TRANSITIONS } from "./fsm.js";
import type { FsmContext } from "./fsm.js";
import type { ActionState } from "./types.js";

const SWORD = WEAPONS.sword;

function ctx(overrides: Partial<FsmContext> = {}): FsmContext {
  return {
    actionTick: 0,
    bits: 0,
    grounded: true,
    stamina: MAX_STAMINA,
    hitstunTicksRemaining: 0,
    hitConfirmTicksRemaining: 0,
    comboCount: 0,
    attackKind: null,
    weapon: SWORD,
    ...overrides,
  };
}

function bits(...names: InputBitName[]): number {
  return encode(names);
}

const ALL_STATES: ActionState[] = [
  "Idle",
  "Run",
  "Airborne",
  "AttackStartup",
  "AttackActive",
  "AttackRecovery",
  "Block",
  "BlockStun",
  "Dodge",
  "HitStun",
  "GuardBroken",
  "Dead",
];

describe("combat fsm — TRANSITIONS table covers every state", () => {
  it.each(ALL_STATES)("%s has a transition function", (state) => {
    expect(TRANSITIONS[state]).toBeTypeOf("function");
  });
});

describe("combat fsm — neutral states (Idle/Run)", () => {
  it("Idle stays Idle with no input", () => {
    expect(TRANSITIONS.Idle(ctx())).toBeNull();
  });

  it("Idle -> Run on LEFT/RIGHT", () => {
    expect(TRANSITIONS.Idle(ctx({ bits: bits("RIGHT") }))).toBe("Run");
    expect(TRANSITIONS.Idle(ctx({ bits: bits("LEFT") }))).toBe("Run");
  });

  it("Idle -> Airborne when not grounded", () => {
    expect(TRANSITIONS.Idle(ctx({ grounded: false }))).toBe("Airborne");
  });

  it("Idle -> AttackStartup on LIGHT or HEAVY", () => {
    expect(TRANSITIONS.Idle(ctx({ bits: bits("LIGHT") }))).toBe("AttackStartup");
    expect(TRANSITIONS.Idle(ctx({ bits: bits("HEAVY") }))).toBe("AttackStartup");
  });

  it("Idle -> Block on BLOCK", () => {
    expect(TRANSITIONS.Idle(ctx({ bits: bits("BLOCK") }))).toBe("Block");
  });

  it("Idle -> Dodge on DODGE when stamina is sufficient", () => {
    expect(TRANSITIONS.Idle(ctx({ bits: bits("DODGE") }))).toBe("Dodge");
  });

  it("Idle does not dodge without enough stamina", () => {
    expect(
      TRANSITIONS.Idle(ctx({ bits: bits("DODGE"), stamina: DODGE_STAMINA_COST - 1 })),
    ).toBeNull();
  });

  it("Run -> Idle when movement released", () => {
    expect(TRANSITIONS.Run(ctx())).toBe("Idle");
  });

  it("Run stays Run while moving", () => {
    expect(TRANSITIONS.Run(ctx({ bits: bits("RIGHT") }))).toBeNull();
  });
});

describe("combat fsm — Airborne", () => {
  it("stays Airborne with no input", () => {
    expect(TRANSITIONS.Airborne(ctx({ grounded: false }))).toBeNull();
  });

  it("cannot block while airborne", () => {
    expect(TRANSITIONS.Airborne(ctx({ grounded: false, bits: bits("BLOCK") }))).toBeNull();
  });

  it("can attack while airborne", () => {
    expect(TRANSITIONS.Airborne(ctx({ grounded: false, bits: bits("LIGHT") }))).toBe(
      "AttackStartup",
    );
  });

  it("lands into Idle or Run once grounded is true", () => {
    expect(TRANSITIONS.Airborne(ctx({ grounded: true }))).toBe("Idle");
    expect(TRANSITIONS.Airborne(ctx({ grounded: true, bits: bits("RIGHT") }))).toBe("Run");
  });
});

describe("combat fsm — attack pipeline", () => {
  it("AttackStartup holds until the weapon's startup ticks elapse", () => {
    expect(
      TRANSITIONS.AttackStartup(ctx({ attackKind: "light", actionTick: SWORD.light.startup - 2 })),
    ).toBeNull();
    expect(
      TRANSITIONS.AttackStartup(ctx({ attackKind: "light", actionTick: SWORD.light.startup - 1 })),
    ).toBe("AttackActive");
  });

  it("AttackActive holds until the weapon's active ticks elapse", () => {
    expect(
      TRANSITIONS.AttackActive(ctx({ attackKind: "light", actionTick: SWORD.light.active - 1 })),
    ).toBe("AttackRecovery");
  });

  it("AttackRecovery returns to neutral once recovery ticks elapse", () => {
    expect(
      TRANSITIONS.AttackRecovery(
        ctx({ attackKind: "light", actionTick: SWORD.light.recovery - 1 }),
      ),
    ).toBe("Idle");
  });

  it("AttackRecovery chains a second light for a weapon with lightChainLimit > 1", () => {
    expect(
      TRANSITIONS.AttackRecovery(
        ctx({ attackKind: "light", bits: bits("LIGHT"), comboCount: 0, actionTick: 0 }),
      ),
    ).toBe("AttackStartup");
  });

  it("AttackRecovery does not chain past the weapon's lightChainLimit", () => {
    expect(
      TRANSITIONS.AttackRecovery(
        ctx({ attackKind: "light", bits: bits("LIGHT"), comboCount: 1, actionTick: 0 }),
      ),
    ).toBeNull();
  });

  it("AttackRecovery cancels into Dodge only within the hit-confirm window", () => {
    expect(
      TRANSITIONS.AttackRecovery(
        ctx({ attackKind: "light", bits: bits("DODGE"), hitConfirmTicksRemaining: 0 }),
      ),
    ).toBeNull();
    expect(
      TRANSITIONS.AttackRecovery(
        ctx({ attackKind: "light", bits: bits("DODGE"), hitConfirmTicksRemaining: 3 }),
      ),
    ).toBe("Dodge");
  });
});

describe("combat fsm — block", () => {
  it("stays Block while BLOCK is held", () => {
    expect(TRANSITIONS.Block(ctx({ bits: bits("BLOCK") }))).toBeNull();
  });

  it("returns to neutral once BLOCK is released", () => {
    expect(TRANSITIONS.Block(ctx())).toBe("Idle");
    expect(TRANSITIONS.Block(ctx({ grounded: false }))).toBe("Airborne");
  });

  it("BlockStun holds for BLOCK_STUN_TICKS then returns to neutral", () => {
    expect(TRANSITIONS.BlockStun(ctx({ actionTick: 3 }))).toBeNull();
    expect(TRANSITIONS.BlockStun(ctx({ actionTick: 5 }))).toBe("Idle");
  });
});

describe("combat fsm — dodge, hitstun, guard break, death", () => {
  it("Dodge is uninterruptible until DODGE_TOTAL_TICKS elapse", () => {
    expect(TRANSITIONS.Dodge(ctx({ actionTick: 5, bits: bits("LIGHT") }))).toBeNull();
    expect(TRANSITIONS.Dodge(ctx({ actionTick: 19 }))).toBe("Idle");
  });

  it("cannot attack during HitStun", () => {
    expect(
      TRANSITIONS.HitStun(ctx({ hitstunTicksRemaining: 5, bits: bits("LIGHT") })),
    ).toBeNull();
  });

  it("HitStun exits to neutral once hitstunTicksRemaining reaches 0", () => {
    expect(TRANSITIONS.HitStun(ctx({ hitstunTicksRemaining: 0 }))).toBe("Idle");
  });

  it("GuardBroken exits to neutral once hitstunTicksRemaining reaches 0", () => {
    expect(TRANSITIONS.GuardBroken(ctx({ hitstunTicksRemaining: 1 }))).toBeNull();
    expect(TRANSITIONS.GuardBroken(ctx({ hitstunTicksRemaining: 0 }))).toBe("Idle");
  });

  it("Dead is terminal regardless of input", () => {
    expect(TRANSITIONS.Dead(ctx({ bits: bits("LIGHT", "DODGE", "BLOCK") }))).toBeNull();
  });
});

describe("applyFsm", () => {
  function player(overrides: Partial<SimPlayer> = {}): SimPlayer {
    return { ...createSimPlayer({ x: 0, y: 0 }), grounded: true, ...overrides };
  }

  it("advances actionTick while staying in the same action", () => {
    const p = player({ action: "Idle", actionTick: 3 });
    const outcome = applyFsm(p, 0, SWORD);
    expect(outcome.action).toBe("Idle");
    expect(outcome.actionTick).toBe(4);
  });

  it("resets actionTick to 0 on a state change", () => {
    const p = player({ action: "Idle", actionTick: 10 });
    const outcome = applyFsm(p, bits("RIGHT"), SWORD);
    expect(outcome.action).toBe("Run");
    expect(outcome.actionTick).toBe(0);
  });

  it("picks attackKind from the triggering button on a fresh attack", () => {
    const p = player({ action: "Idle" });
    expect(applyFsm(p, bits("LIGHT"), SWORD).attackKind).toBe("light");
    expect(applyFsm(p, bits("HEAVY"), SWORD).attackKind).toBe("heavy");
  });

  it("picks airLight instead of light for a fresh attack while airborne", () => {
    const p = player({ action: "Airborne", grounded: false });
    expect(applyFsm(p, bits("LIGHT"), SWORD).attackKind).toBe("airLight");
    // Heavy has no aerial variant — reuses the grounded heavy per weapons.ts.
    expect(applyFsm(p, bits("HEAVY"), SWORD).attackKind).toBe("heavy");
  });

  it("clears attackKind and comboCount when leaving the attack pipeline", () => {
    const p = player({
      action: "AttackRecovery",
      actionTick: SWORD.light.recovery - 1,
      attackKind: "light",
      comboCount: 1,
    });
    const outcome = applyFsm(p, 0, SWORD);
    expect(outcome.action).toBe("Idle");
    expect(outcome.attackKind).toBeNull();
    expect(outcome.comboCount).toBe(0);
  });

  it("increments comboCount on a chained light and keeps attackKind light", () => {
    const p = player({
      action: "AttackRecovery",
      actionTick: 0,
      attackKind: "light",
      comboCount: 0,
    });
    const outcome = applyFsm(p, bits("LIGHT"), SWORD);
    expect(outcome.action).toBe("AttackStartup");
    expect(outcome.attackKind).toBe("light");
    expect(outcome.comboCount).toBe(1);
  });

  it("spends stamina and sets invulnTicks entering Dodge", () => {
    const p = player({ action: "Idle", stamina: MAX_STAMINA });
    const outcome = applyFsm(p, bits("DODGE"), SWORD);
    expect(outcome.action).toBe("Dodge");
    expect(outcome.staminaDelta).toBe(-DODGE_STAMINA_COST);
    expect(outcome.invulnTicks).toBeGreaterThan(0);
  });

  it("regenerates stamina only in neutral states", () => {
    const idle = player({ action: "Idle" });
    expect(applyFsm(idle, 0, SWORD).staminaDelta).toBeGreaterThan(0);

    const blocking = player({ action: "Block" });
    expect(applyFsm(blocking, bits("BLOCK"), SWORD).staminaDelta).toBe(0);
  });

  it("decays hitstunTicks and invulnTicks by one tick", () => {
    const p = player({ action: "HitStun", hitstunTicks: 5, invulnTicks: 3 });
    const outcome = applyFsm(p, 0, SWORD);
    expect(outcome.hitstunTicks).toBe(4);
    expect(outcome.invulnTicks).toBe(2);
  });
});
