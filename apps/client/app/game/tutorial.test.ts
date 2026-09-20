import { describe, expect, it } from "vitest";
import type { HudPlayerSnapshot } from "./hud.js";
import {
  advanceTutorial,
  currentTutorialStep,
  TUTORIAL_STEPS,
  type TutorialStepId,
} from "./tutorial.js";

function player(overrides: Partial<HudPlayerSnapshot> = {}): HudPlayerSnapshot {
  return {
    id: "me",
    name: "Me",
    isLocal: true,
    isBot: false,
    hp: 100,
    stamina: 100,
    weapon: "sword",
    action: "Idle",
    attackKind: "",
    dropThroughTicks: 0,
    grounded: true,
    y: 632,
    powerups: [],
    ...overrides,
  };
}

const none = new Set<TutorialStepId>();

describe("tutorial steps", () => {
  it("run in the order the lesson teaches them, each with words for a keyboard and for touch", () => {
    expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual([
      "move",
      "jump",
      "dropThrough",
      "light",
      "heavy",
      "block",
      "dodge",
    ]);
    for (const step of TUTORIAL_STEPS) {
      expect(step.keyboard.length).toBeGreaterThan(0);
      expect(step.touch.length).toBeGreaterThan(0);
    }
    expect(currentTutorialStep(none)?.id).toBe("move");
  });

  it("does nothing until the current step is done, and never counts a step out of turn", () => {
    // Standing still, falling from the spawn, blocking early: none of it is "move".
    for (const overrides of [{}, { action: "Airborne", grounded: false }, { action: "Block" }]) {
      expect(advanceTutorial(none, player(overrides))).toBe(none);
    }
  });

  it("moves on one step at a time, in order", () => {
    let done: ReadonlySet<TutorialStepId> = none;
    done = advanceTutorial(done, player({ action: "Run" }));
    expect([...done]).toEqual(["move"]);

    // A dodge now is not "jump": the current step is jump.
    expect(advanceTutorial(done, player({ action: "Dodge" }))).toBe(done);

    done = advanceTutorial(done, player({ action: "Airborne", grounded: false }));
    expect([...done]).toEqual(["move", "jump"]);
  });

  it("recognises each lesson from the player's own state", () => {
    const cases: [TutorialStepId, Partial<HudPlayerSnapshot>][] = [
      ["move", { action: "Run" }],
      ["jump", { action: "Airborne", grounded: false }],
      ["dropThrough", { dropThroughTicks: 8, y: 452 }],
      ["light", { action: "AttackStartup", attackKind: "light" }],
      ["heavy", { action: "AttackStartup", attackKind: "heavy" }],
      ["block", { action: "Block" }],
      ["dodge", { action: "Dodge" }],
    ];
    let done: ReadonlySet<TutorialStepId> = none;
    for (const [id, overrides] of cases) {
      expect(currentTutorialStep(done)?.id).toBe(id);
      done = advanceTutorial(done, player(overrides));
      expect(done.has(id)).toBe(true);
    }
    expect(currentTutorialStep(done)).toBeNull();
  });

  it("counts an aerial light as a light, but not a heavy as one", () => {
    const upToLight = new Set<TutorialStepId>(["move", "jump", "dropThrough"]);
    expect(
      advanceTutorial(upToLight, player({ action: "AttackActive", attackKind: "airLight" })).has(
        "light",
      ),
    ).toBe(true);
    expect(
      advanceTutorial(upToLight, player({ action: "AttackActive", attackKind: "heavy" })).has(
        "light",
      ),
    ).toBe(false);
  });

  it("a drop-through only counts from the platform, not from the floor", () => {
    const upToDrop = new Set<TutorialStepId>(["move", "jump"]);
    expect(
      advanceTutorial(upToDrop, player({ dropThroughTicks: 8, y: 632 })).has("dropThrough"),
    ).toBe(false);
    expect(
      advanceTutorial(upToDrop, player({ dropThroughTicks: 8, y: 452 })).has("dropThrough"),
    ).toBe(true);
  });
});
