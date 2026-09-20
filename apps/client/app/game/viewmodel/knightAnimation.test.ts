import {
  ACTION_STATES,
  getAttack,
  getWeapon,
  WEAPON_IDS,
  type AttackKind,
} from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import {
  ATTACK_CLIPS,
  allClips,
  attackClip,
  clipLength,
  knightPose,
  type KnightPoseInput,
} from "./knightAnimation.js";

const base: KnightPoseInput = {
  action: "Idle",
  actionTick: 0,
  weapon: WEAPON_IDS.SWORD,
  attackKind: "",
  vy: 0,
};

const WEAPONS = Object.values(WEAPON_IDS);
const KINDS: AttackKind[] = ["light", "heavy", "airLight"];

describe("knightPose", () => {
  it("maps every ActionState x weapon to a clip that exists, with the frame in range", () => {
    for (const action of ACTION_STATES) {
      for (const weapon of WEAPONS) {
        for (const attackKind of ["", ...KINDS]) {
          for (const actionTick of [0, 1, 5, 30, 1000]) {
            for (const vy of [-100, 0, 100]) {
              const pose = knightPose({ action, actionTick, weapon, attackKind, vy });
              expect(allClips()).toContain(pose.clip);
              expect(pose.frame).toBeGreaterThanOrEqual(0);
              expect(pose.frame).toBeLessThan(clipLength(pose.clip));
            }
          }
        }
      }
    }
  });

  it("falls back to idle and the sword's light attack on unknown strings", () => {
    expect(knightPose({ ...base, action: "Levitating" }).clip).toBe("idle");
    expect(
      knightPose({ ...base, action: "AttackActive", weapon: "bow", attackKind: "?" }).clip,
    ).toBe("sword-attack-light");
  });

  it("wraps looping clips and holds one-shot clips on their last frame", () => {
    expect(knightPose({ ...base, action: "Run", actionTick: 0 }).frame).toBe(0);
    expect(knightPose({ ...base, action: "Run", actionTick: 6 * 5 }).frame).toBe(0);
    const dead = knightPose({ ...base, action: "Dead", actionTick: 10_000 });
    expect(dead.frame).toBe(clipLength("dead") - 1);
  });

  it("picks rise or fall by vertical velocity", () => {
    expect(knightPose({ ...base, action: "Airborne", vy: -50 }).clip).toBe("jump-rise");
    expect(knightPose({ ...base, action: "Airborne", vy: 50 }).clip).toBe("jump-fall");
  });

  describe("attacks line up with the combat frame data", () => {
    for (const weapon of WEAPONS) {
      for (const kind of KINDS) {
        it(`${weapon} ${kind}: startup, active and recovery ticks stay in their own frame ranges`, () => {
          const attack = getAttack(getWeapon(weapon), kind);
          const spec = ATTACK_CLIPS[attackClip(weapon, kind)];
          const at = (action: string, actionTick: number) =>
            knightPose({ ...base, action, actionTick, weapon, attackKind: kind });

          const startup = Array.from({ length: attack.startup }, (_, t) => at("AttackStartup", t));
          const active = Array.from({ length: attack.active }, (_, t) => at("AttackActive", t));
          const recovery = Array.from({ length: attack.recovery }, (_, t) =>
            at("AttackRecovery", t),
          );

          for (const p of startup) {
            expect(p.frame).toBeLessThan(spec.startup);
          }
          for (const p of active) {
            expect(p.frame).toBeGreaterThanOrEqual(spec.startup);
            expect(p.frame).toBeLessThan(spec.startup + spec.active);
          }
          for (const p of recovery) {
            expect(p.frame).toBeGreaterThanOrEqual(spec.startup + spec.active);
          }
          // The strike frame is on screen for the whole active window, first tick to last.
          expect(active[0]?.frame).toBe(spec.startup);
          expect(active.at(-1)?.frame).toBe(spec.startup + spec.active - 1);
          // Frames never go backwards across the whole attack.
          const all = [...startup, ...active, ...recovery].map((p) => p.frame);
          expect(all).toEqual([...all].sort((a, b) => a - b));
          expect(recovery.at(-1)?.frame).toBe(clipLength(attackClip(weapon, kind)) - 1);
        });
      }
    }
  });
});
