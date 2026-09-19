import { matchMaker } from "colyseus";
import type { Application } from "express";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { recordMatchFailureCount } from "../persistence/RecordMatchQueue.js";

/**
 * Plan Phase 10 step 1: "a `/metrics` endpoint via `prom-client`: CCU, rooms
 * by phase, tick duration histogram, patch bytes per second, input drops,
 * and `recordMatch` failures." `prom-client@15.1.3` is npm's deprecated-but-
 * still-`latest`-tagged major as of this writing (the announced successor,
 * `@prometheus-io/client`, is a pre-1.0 rename at `0.16.x` — not yet a
 * like-for-like replacement) — matches the plan's own naming, checked
 * against the actually-installed package rather than assumed.
 *
 * **`patch bytes per second` is NOT implemented** — `@colyseus/core`'s
 * `Room.broadcastPatch()` never exposes the encoded patch's byte size
 * through any public API (`_serializer.applyPatches()` returns only a
 * `hasChanges: boolean`), and calling `MatchState`'s own `@colyseus/schema`
 * `encode()` from outside Colyseus's own patch cycle would consume the same
 * dirty-tracking `broadcastPatch()` itself relies on, corrupting the real
 * patch stream every connected client depends on. See
 * `docs/research/phase10-scope-deviations.md` for the full reasoning.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

/** `matchMaker.stats.local` is a synchronous, always-current read (no
 *  polling loop of our own needed) — a `collect()` callback re-reads it
 *  exactly when `/metrics` is scraped, not on some independent interval
 *  that could drift from the actual scrape. */
new Gauge({
  name: "castle_clash_ccu",
  help: "Concurrent connected users on this process",
  registers: [registry],
  collect() {
    this.set(matchMaker.stats.local.ccu);
  },
});

/** Labeled by `MatchPhase` (`Waiting`/`Countdown`/`RoundActive`/`RoundOver`/
 *  `Draft`/`MatchOver`) — `MatchRoom` calls `setRoomPhase`/`removeRoom`
 *  below to keep this in sync with its own `#syncMatchFlow()` and
 *  `onDispose()`, rather than this module polling room state itself. */
export const roomsByPhaseGauge = new Gauge({
  name: "castle_clash_rooms_by_phase",
  help: "Number of active MatchRooms, per match-flow phase",
  labelNames: ["phase"],
  registers: [registry],
});

export const tickDurationSeconds = new Histogram({
  name: "castle_clash_tick_duration_seconds",
  help: "Wall-clock duration of one MatchRoom#tick() call",
  // TICK_RATE is 60Hz (a ~16.7ms budget) — buckets span well below and
  // above that so a regression shows up in a middle bucket, not just "over
  // budget" or "under."
  buckets: [0.001, 0.002, 0.004, 0.008, 0.016, 0.032, 0.064, 0.128],
  registers: [registry],
});

/** Labeled by why the message never reached its handler — mirrors the two
 *  cases `MatchRoom.#onInput`/`#onDraftPick` already distinguish in their
 *  log messages. */
export const inputDropsTotal = new Counter({
  name: "castle_clash_input_drops_total",
  help: "Input/draft-pick messages dropped before being applied",
  labelNames: ["reason"],
  registers: [registry],
});

/** `recordMatchFailureCount` (RecordMatchQueue.ts) is the actual source of
 *  truth — this Gauge just samples it on scrape, so there is exactly one
 *  counter incremented anywhere in the codebase, not two drifting copies. */
new Gauge({
  name: "castle_clash_record_match_failures_total",
  help: "Matches whose recordMatch never succeeded after exhausting all retries",
  registers: [registry],
  collect() {
    this.set(recordMatchFailureCount.value);
  },
});

const roomPhaseById = new Map<string, string>();

/** Called from `MatchRoom#syncMatchFlow()` every tick — a no-op unless the
 *  phase actually changed since the last call, so this isn't re-decrementing
 *  and re-incrementing the same label 60 times a second for a room sitting
 *  in `RoundActive`. */
export function setRoomPhase(roomId: string, phase: string): void {
  const previous = roomPhaseById.get(roomId);
  if (previous === phase) {
    return;
  }
  if (previous) {
    roomsByPhaseGauge.labels(previous).dec();
  }
  roomsByPhaseGauge.labels(phase).inc();
  roomPhaseById.set(roomId, phase);
}

/** Called from `MatchRoom#onDispose()` — without this, a disposed room's
 *  last-known phase would count forever. */
export function removeRoomPhase(roomId: string): void {
  const previous = roomPhaseById.get(roomId);
  if (previous) {
    roomsByPhaseGauge.labels(previous).dec();
    roomPhaseById.delete(roomId);
  }
}

export function registerMetricsRoute(app: Application): void {
  // Express 5 forwards a rejected async handler to error middleware on its
  // own — no manual try/catch or `void (async () => {...})()` wrapper needed.
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });
}
