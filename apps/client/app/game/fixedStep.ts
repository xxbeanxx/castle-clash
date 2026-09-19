/**
 * How many fixed sim steps to run this frame, and what to carry over (plan Phase 13 step 10).
 *
 * A backgrounded mobile tab can hand the ticker a gap of seconds. Replaying all of it would run
 * hundreds of ticks in one frame (a catch-up spiral, and a flood of input messages the server rate
 * limits), so the backlog beyond `maxSteps` is dropped: the game resumes from now instead of
 * fast-forwarding through a stretch nobody played.
 */
export const MAX_CATCHUP_STEPS = 5;

export interface StepPlan {
  steps: number;
  /** The new accumulator: under one step, ready for the next frame. */
  accumulatorMs: number;
}

export function planSteps(
  accumulatorMs: number,
  deltaMs: number,
  stepMs: number,
  maxSteps: number = MAX_CATCHUP_STEPS,
): StepPlan {
  const total = Math.max(0, accumulatorMs) + Math.max(0, deltaMs);
  const due = Math.floor(total / stepMs);
  if (due > maxSteps) {
    return { steps: maxSteps, accumulatorMs: 0 };
  }
  return { steps: due, accumulatorMs: total - due * stepMs };
}
