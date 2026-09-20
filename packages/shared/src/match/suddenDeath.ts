import {
  SUDDEN_DEATH_BASE_DRAIN_PER_SECOND,
  SUDDEN_DEATH_MAX_MULTIPLIER,
  SUDDEN_DEATH_RAMP_TICKS,
  TICK_RATE,
} from "../config/game.js";

/**
 * How much harder everything hits, `ticks` after sudden death began: 1 outside it (`ticks <= 0`),
 * rising linearly to `SUDDEN_DEATH_MAX_MULTIPLIER` over `SUDDEN_DEATH_RAMP_TICKS`, then flat.
 */
export function suddenDeathMultiplier(ticks: number): number {
  if (ticks <= 0) {
    return 1;
  }
  const progress = Math.min(1, ticks / SUDDEN_DEATH_RAMP_TICKS);
  return 1 + (SUDDEN_DEATH_MAX_MULTIPLIER - 1) * progress;
}

/** HP every living player loses this tick, `ticks` into sudden death; 0 outside it. */
export function suddenDeathDrain(ticks: number): number {
  if (ticks <= 0) {
    return 0;
  }
  return (SUDDEN_DEATH_BASE_DRAIN_PER_SECOND / TICK_RATE) * suddenDeathMultiplier(ticks);
}
