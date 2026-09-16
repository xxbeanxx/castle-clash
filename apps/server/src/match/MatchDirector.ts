import {
  advanceMatchPhase,
  BASE_STATS,
  computeStats,
  createMatchPhaseState,
  createSimPlayer,
  getWeapon,
  resetHazardState,
  RING_OUT_CREDIT_TICKS,
  WEAPON_IDS,
  type EliminatedEvent,
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

/** Respawns every player AND resets hazard state for the new round (plan
 *  Phase 6 step 4: "breakable floors reset between rounds") —
 *  `resetHazardState` carries over a `BreakableFloorDef`'s state instead of
 *  resetting it when its own `respawnPerRound` is `false`; nothing in this
 *  phase's six arenas sets that yet.
 *
 * Phase 7: `powerups`/`ringOutArmorChargesUsed` survive the reset the same
 * way `weapon` already does — a match-wide resource, not a per-round one —
 * and a respawn's fresh hp/stamina come from that player's own
 * `DerivedStats.maxHp`/`staminaMax` (via `computeStats`), not the flat
 * `MAX_HP`/`MAX_STAMINA` `createSimPlayer` defaults to, so a `stoneSkin`/
 * `ironLungs` pick actually raises what you respawn with. */
function respawnPlayers(sim: SimState, connectedIds: readonly PlayerId[]): SimState {
  const players: Record<PlayerId, SimPlayer> = {};
  connectedIds.forEach((id, i) => {
    const spawn = sim.arena.spawns[i % sim.arena.spawns.length]!;
    const existing = sim.players[id];
    const weapon = existing?.weapon ?? WEAPON_IDS.SWORD;
    const powerups = existing?.powerups;
    const stats = computeStats(BASE_STATS, getWeapon(weapon), powerups ?? {});
    players[id] = {
      ...createSimPlayer(spawn, weapon),
      hp: stats.maxHp,
      stamina: stats.staminaMax,
      powerups,
      ringOutArmorChargesUsed: existing?.ringOutArmorChargesUsed,
    };
  });
  const hazards = resetHazardState(sim.arena.hazards, sim.hazards ?? {}, sim.tick);
  return { ...sim, players, hazards };
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
   * A player leaves — consented or not — during `RoundActive` (plan step 2:
   * "disconnecting during RoundActive" counts as an elimination; a
   * deliberate mid-round quit is treated the same way, since the round
   * can't otherwise tell the two apart from `SimState` alone). Credits
   * whoever last hit them within `RING_OUT_CREDIT_TICKS`. Called from both
   * `MatchRoom.onDrop` (which keeps the seat open via `allowReconnection`,
   * so this only affects the *current* round) and `MatchRoom.onLeave` (for
   * a leave with no prior drop). A no-op if the player is already not
   * alive — an unconsented drop's `onDrop` already eliminated them, so the
   * `onLeave` that follows once the reconnection window closes doesn't
   * double-count.
   *
   * Returns the `eliminated` event to broadcast as fx, or `null` when the
   * player wasn't alive (nothing happened) — `MatchRoom` only broadcasts a
   * non-null result.
   */
  eliminateByDisconnect(id: PlayerId, sim: SimState, tick: number): EliminatedEvent | null {
    if (!this.#alive.has(id)) {
      return null;
    }
    const player = sim.players[id];
    const creditedTo =
      player?.lastHitBy && tick - player.lastHitTick <= RING_OUT_CREDIT_TICKS ? player.lastHitBy : undefined;
    this.#markEliminated(id, creditedTo);
    return { type: "eliminated", victim: id, by: creditedTo, cause: "disconnect" };
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

  /**
   * `draftComplete` is `DraftService`'s call, not this class's — `MatchRoom`
   * is the only real caller that ever passes `false` (while a live draft is
   * still waiting on picks). Defaulting to `true` here, rather than in
   * `match/phase.ts` itself, means every test at this level that doesn't
   * care about draft timing (most of `MatchDirector.test.ts`) keeps the
   * exact one-tick `Draft` pass-through Phase 7 replaced, without having to
   * thread a dummy `DraftService` through just to get through a round
   * boundary.
   */
  tick(
    prevSim: SimState,
    nextSim: SimState,
    events: readonly SimEvent[],
    connectedIds: readonly PlayerId[],
    draftComplete = true,
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
      draftComplete,
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
