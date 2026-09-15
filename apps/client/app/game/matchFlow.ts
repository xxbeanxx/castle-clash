import type { MatchState } from "@castle-clash/shared";

export interface MatchFlowSnapshot {
  phase: string;
  round: number;
  /** Ticks left until `phaseEndsAtTick`, or `null` when the current phase
   *  has no scheduled end (`MatchState.phaseEndsAtTick`'s `-1` sentinel). */
  ticksRemaining: number | null;
}

/**
 * Pure `MatchState -> MatchFlowSnapshot` mapping, the phase-banner
 * equivalent of `hud.ts`'s `matchStateToHud` — pushed from the same
 * `onStateChange` callback, already throttled to `PATCH_RATE`.
 */
export function matchStateToPhaseBanner(state: MatchState): MatchFlowSnapshot {
  return {
    phase: state.phase,
    round: state.round,
    ticksRemaining: state.phaseEndsAtTick >= 0 ? Math.max(0, state.phaseEndsAtTick - state.tick) : null,
  };
}
