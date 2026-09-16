import {
  COUNTDOWN_TICKS,
  DRAFT_TICKS,
  MIN_PLAYERS,
  ROUND_OVER_TICKS,
  ROUND_TIME_LIMIT,
  ROUNDS_TO_WIN,
} from "../config/game.js";
import type { PlayerId } from "../types/ids.js";

export type MatchPhase = "Waiting" | "Countdown" | "RoundActive" | "RoundOver" | "Draft" | "MatchOver";

export interface MatchPhaseState {
  phase: MatchPhase;
  /** 1-based; 0 before the first round starts. */
  round: number;
  /** Ticks spent in the current `phase`; resets to 0 on every transition. */
  ticksInPhase: number;
  roundsWon: Readonly<Partial<Record<PlayerId, number>>>;
  /** Set once a `RoundActive` phase runs past `ROUND_TIME_LIMIT`; cleared on
   *  the next round. */
  suddenDeath: boolean;
  /** Absolute tick the current phase is scheduled to end at, for a countdown
   *  or results banner — `null` when the phase has no fixed end (`Waiting`,
   *  `RoundActive` outside a time limit's reach, `MatchOver`). */
  phaseEndsAtTick: number | null;
  /** Set once `MatchOver` is reached; `null` for a drawn match (never
   *  actually reachable today, since `ROUNDS_TO_WIN` always has a sole
   *  leader by definition — kept nullable so a future "match ends in a tie"
   *  rule doesn't need a type change). */
  winner: PlayerId | null;
}

export interface MatchPhaseInput {
  /** Absolute sim tick "now" — used only to compute `phaseEndsAtTick`. */
  tick: number;
  /** Connected, non-spectator players in the room right now. */
  playerCount: number;
  /** Ids of the players still alive in the current round. Only consulted
   *  during `RoundActive`. */
  aliveIds: readonly PlayerId[];
  /** Whether `DraftService` considers the current round's draft resolved
   *  (every player picked, or its own timeout auto-picked the rest) — only
   *  consulted during `Draft`. `advanceMatchPhase` doesn't own draft timing
   *  itself; it just reacts to this plus its own `DRAFT_TICKS` hard fallback
   *  (see that constant's doc comment) so a caller that doesn't care about
   *  drafts at all (most of this file's own tests) can pass `true` and get
   *  the same one-tick pass-through Phase 7 replaced. */
  draftComplete: boolean;
}

export type MatchPhaseEvent =
  | { type: "roundStart"; round: number }
  | { type: "roundEnd"; round: number; winner: PlayerId | null }
  | { type: "suddenDeath" }
  /** Emitted the instant `RoundOver -> Draft` fires — `MatchDirector`/
   *  `MatchRoom` react to this by starting `DraftService` for the round
   *  (plan Phase 7 step 4), the same way `roundStart` already triggers a
   *  respawn. */
  | { type: "draftStart"; round: number }
  | { type: "matchOver"; winner: PlayerId | null };

export interface MatchPhaseResult {
  state: MatchPhaseState;
  events: MatchPhaseEvent[];
}

export function createMatchPhaseState(): MatchPhaseState {
  return {
    phase: "Waiting",
    round: 0,
    ticksInPhase: 0,
    roundsWon: {},
    suddenDeath: false,
    phaseEndsAtTick: null,
    winner: null,
  };
}

function withPhase(
  state: MatchPhaseState,
  patch: Partial<MatchPhaseState> & { phase: MatchPhase },
): MatchPhaseState {
  return { ...state, ticksInPhase: 0, phaseEndsAtTick: null, ...patch };
}

/**
 * Runs one tick of the match-flow FSM (plan Phase 5 step 1): pure, no I/O —
 * `MatchDirector` drives it once per server tick and reacts to the returned
 * events (reset the sim between rounds, build a `MatchResult`, etc).
 *
 * `Waiting -> Countdown -> RoundActive -> RoundOver -> Draft -> Countdown …`
 * until a player reaches `ROUNDS_TO_WIN`, at which point the match ends.
 */
export function advanceMatchPhase(state: MatchPhaseState, input: MatchPhaseInput): MatchPhaseResult {
  const events: MatchPhaseEvent[] = [];

  switch (state.phase) {
    case "Waiting": {
      if (input.playerCount >= MIN_PLAYERS) {
        return {
          state: withPhase(state, { phase: "Countdown", phaseEndsAtTick: input.tick + COUNTDOWN_TICKS }),
          events,
        };
      }
      return { state: { ...state, ticksInPhase: state.ticksInPhase + 1 }, events };
    }

    case "Countdown": {
      if (input.playerCount < MIN_PLAYERS) {
        return { state: withPhase(state, { phase: "Waiting" }), events };
      }
      const ticksInPhase = state.ticksInPhase + 1;
      if (ticksInPhase >= COUNTDOWN_TICKS) {
        const round = state.round + 1;
        events.push({ type: "roundStart", round });
        return { state: withPhase(state, { phase: "RoundActive", round, suddenDeath: false }), events };
      }
      return {
        state: { ...state, ticksInPhase, phaseEndsAtTick: input.tick + (COUNTDOWN_TICKS - ticksInPhase) },
        events,
      };
    }

    case "RoundActive": {
      const ticksInPhase = state.ticksInPhase + 1;
      let suddenDeath = state.suddenDeath;
      if (!suddenDeath && ticksInPhase >= ROUND_TIME_LIMIT) {
        suddenDeath = true;
        events.push({ type: "suddenDeath" });
      }

      if (input.aliveIds.length <= 1) {
        const winner = input.aliveIds[0] ?? null;
        const roundsWon = winner
          ? { ...state.roundsWon, [winner]: (state.roundsWon[winner] ?? 0) + 1 }
          : state.roundsWon;
        events.push({ type: "roundEnd", round: state.round, winner });

        const matchWinner = winner && (roundsWon[winner] ?? 0) >= ROUNDS_TO_WIN ? winner : null;
        if (matchWinner) {
          events.push({ type: "matchOver", winner: matchWinner });
          return { state: withPhase(state, { phase: "MatchOver", roundsWon, winner: matchWinner }), events };
        }
        return {
          state: withPhase(state, {
            phase: "RoundOver",
            roundsWon,
            phaseEndsAtTick: input.tick + ROUND_OVER_TICKS,
          }),
          events,
        };
      }

      return { state: { ...state, ticksInPhase, suddenDeath }, events };
    }

    case "RoundOver": {
      const ticksInPhase = state.ticksInPhase + 1;
      if (ticksInPhase >= ROUND_OVER_TICKS) {
        events.push({ type: "draftStart", round: state.round });
        return { state: withPhase(state, { phase: "Draft" }), events };
      }
      return {
        state: { ...state, ticksInPhase, phaseEndsAtTick: input.tick + (ROUND_OVER_TICKS - ticksInPhase) },
        events,
      };
    }

    case "Draft": {
      if (input.playerCount < MIN_PLAYERS) {
        return { state: withPhase(state, { phase: "Waiting" }), events };
      }
      const ticksInPhase = state.ticksInPhase + 1;
      if (input.draftComplete || ticksInPhase >= DRAFT_TICKS) {
        return {
          state: withPhase(state, { phase: "Countdown", phaseEndsAtTick: input.tick + COUNTDOWN_TICKS }),
          events,
        };
      }
      return {
        state: { ...state, ticksInPhase, phaseEndsAtTick: input.tick + (DRAFT_TICKS - ticksInPhase) },
        events,
      };
    }

    case "MatchOver": {
      return { state, events };
    }
  }
}
