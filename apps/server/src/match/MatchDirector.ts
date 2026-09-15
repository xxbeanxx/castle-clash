import {
  advanceMatchPhase,
  createMatchPhaseState,
  createSimPlayer,
  RING_OUT_CREDIT_TICKS,
  type MatchPhaseEvent,
  type MatchPhaseState,
  type MatchResult,
  type MatchStatsEntry,
  type PlayerId,
  type SimEvent,
  type SimPlayer,
  type SimState,
} from "@castle-clash/shared";

export type { MatchResult, MatchStatsEntry };

export interface MatchDirectorTickResult {
  /** `nextSim`, unless a new round just started — respawned in that case. */
  state: SimState;
  phase: MatchPhaseState;
  events: readonly MatchPhaseEvent[];
  /** Set exactly on the tick `MatchOver` is reached. */
  result: MatchResult | null;
}

function zeroStats(): MatchStatsEntry {
  return { eliminations: 0, deaths: 0, damageDealt: 0, roundsWon: 0 };
}

function respawnPlayers(sim: SimState, connectedIds: readonly PlayerId[]): SimState {
  const players: Record<PlayerId, SimPlayer> = {};
  connectedIds.forEach((id, i) => {
    const spawn = sim.arena.spawns[i % sim.arena.spawns.length]!;
    players[id] = createSimPlayer(spawn, sim.players[id]?.weapon);
  });
  return { ...sim, players };
}

/**
 * Runs the match-flow FSM (`match/phase.ts`) once per server tick (plan
 * Phase 5 step 3): folds a tick's `SimEvent`s into per-player
 * eliminations/deaths/damage, resets `SimState` between rounds (respawn,
 * full HP/stamina — weapon choice, once Phase 7's draft can change it,
 * survives the reset), and produces a `MatchResult` the instant the phase
 * FSM reaches `MatchOver`.
 *
 * Deliberately has no idea what a `Room`, a `Client`, or a network
 * connection is — `MatchRoom` is the only thing that touches Colyseus here,
 * so this class runs identically against a real room or a bare `SimHarness`
 * script in tests.
 */
export class MatchDirector {
  #phase: MatchPhaseState = createMatchPhaseState();
  #stats: Record<PlayerId, MatchStatsEntry> = {};
  #alive = new Set<PlayerId>();

  get phase(): MatchPhaseState {
    return this.#phase;
  }

  isAlive(id: PlayerId): boolean {
    return this.#alive.has(id);
  }

  /** Called from `MatchRoom.onJoin` for every non-spectator player — a
   *  spectator only calls this once promoted to an active seat at the next
   *  round start. */
  addPlayer(id: PlayerId): void {
    this.#stats[id] ??= zeroStats();
    this.#alive.add(id);
  }

  /** Called from `MatchRoom.onLeave` once a player's seat is truly gone
   *  (consented leave, or a dropped connection whose reconnection window
   *  expired) — NOT for a reconnectable drop, which is
   *  {@link eliminateByDisconnect} instead. */
  removePlayer(id: PlayerId): void {
    this.#alive.delete(id);
  }

  /**
   * A client dropped without consent during `RoundActive` (plan step 2):
   * counts as an elimination for the current round, crediting whoever last
   * hit them within `RING_OUT_CREDIT_TICKS` — but keeps its `MatchStatsEntry`
   * and seat, since `MatchRoom` still holds it open via `allowReconnection`.
   */
  eliminateByDisconnect(id: PlayerId, sim: SimState, tick: number): void {
    if (!this.#alive.has(id)) {
      return;
    }
    const player = sim.players[id];
    const creditedTo =
      player?.lastHitBy && tick - player.lastHitTick <= RING_OUT_CREDIT_TICKS ? player.lastHitBy : undefined;
    this.#markEliminated(id, creditedTo);
  }

  #markEliminated(id: PlayerId, creditedTo: PlayerId | undefined): void {
    this.#alive.delete(id);
    this.#stats[id] ??= zeroStats();
    this.#stats[id]!.deaths += 1;
    if (creditedTo) {
      this.#stats[creditedTo] ??= zeroStats();
      this.#stats[creditedTo]!.eliminations += 1;
    }
  }

  tick(
    prevSim: SimState,
    nextSim: SimState,
    events: readonly SimEvent[],
    connectedIds: readonly PlayerId[],
  ): MatchDirectorTickResult {
    for (const event of events) {
      if (
        (event.type === "hit" || event.type === "blocked" || event.type === "guardBreak") &&
        event.defender
      ) {
        const before = prevSim.players[event.defender]?.hp ?? 0;
        const after = nextSim.players[event.defender]?.hp ?? 0;
        this.#stats[event.attacker] ??= zeroStats();
        this.#stats[event.attacker]!.damageDealt += Math.max(0, before - after);
      }
      if (event.type === "eliminated") {
        this.#markEliminated(event.victim, event.by);
      }
    }

    const aliveIds = connectedIds.filter((id) => this.#alive.has(id));
    const { state: phase, events: phaseEvents } = advanceMatchPhase(this.#phase, {
      tick: nextSim.tick,
      playerCount: connectedIds.length,
      aliveIds,
    });
    this.#phase = phase;

    let state = nextSim;
    let result: MatchResult | null = null;
    for (const event of phaseEvents) {
      if (event.type === "roundStart") {
        this.#alive = new Set(connectedIds);
        state = respawnPlayers(nextSim, connectedIds);
      }
      if (event.type === "matchOver") {
        result = this.#buildResult(event.winner);
      }
    }

    return { state, phase, events: phaseEvents, result };
  }

  #buildResult(winner: PlayerId | null): MatchResult {
    const ids = new Set<PlayerId>([
      ...(Object.keys(this.#stats) as PlayerId[]),
      ...(Object.keys(this.#phase.roundsWon) as PlayerId[]),
    ]);
    const stats: Record<PlayerId, MatchStatsEntry> = {};
    for (const id of ids) {
      stats[id] = { ...(this.#stats[id] ?? zeroStats()), roundsWon: this.#phase.roundsWon[id] ?? 0 };
    }
    return { winner, rounds: this.#phase.round, stats };
  }
}
