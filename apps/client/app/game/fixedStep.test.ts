import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CATCHUP_STEPS, planSteps } from "./fixedStep.js";

const STEP = 1000 / 60;

describe("planSteps", () => {
  it("runs nothing until a whole step has accumulated", () => {
    expect(planSteps(0, 10, STEP)).toEqual({ steps: 0, accumulatorMs: 10 });
  });

  it("carries the remainder into the next frame", () => {
    const first = planSteps(0, 20, STEP);
    expect(first.steps).toBe(1);
    expect(first.accumulatorMs).toBeCloseTo(20 - STEP, 9);
  });

  it("clamps a long gap (a backgrounded tab) and drops the backlog", () => {
    expect(planSteps(0, 30_000, STEP)).toEqual({ steps: MAX_CATCHUP_STEPS, accumulatorMs: 0 });
  });

  it("allows exactly the cap without dropping anything", () => {
    const plan = planSteps(0, STEP * MAX_CATCHUP_STEPS + 1, STEP);
    expect(plan.steps).toBe(MAX_CATCHUP_STEPS);
    expect(plan.accumulatorMs).toBeCloseTo(1, 6);
  });

  it("ignores negative input", () => {
    expect(planSteps(-5, -5, STEP)).toEqual({ steps: 0, accumulatorMs: 0 });
  });

  it("property: never more than the cap, and never a leftover of a whole step", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100_000, noNaN: true }),
        (acc, delta) => {
          const plan = planSteps(acc, delta, STEP);
          return plan.steps <= MAX_CATCHUP_STEPS && plan.accumulatorMs < STEP + 1e-9;
        },
      ),
    );
  });
});
