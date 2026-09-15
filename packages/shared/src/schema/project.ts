import type { SimState } from "../sim/types.js";
import type { PlayerId } from "../types/ids.js";
import type { MatchState } from "./state.js";

/**
 * Copies sim state into the network schema once per tick (ADR 0001) — the
 * only place gameplay state crosses from plain `SimState` objects into
 * `@colyseus/schema` instances. Never creates or removes schema players:
 * `MatchRoom`'s `onJoin`/`onLeave` own that lifecycle, so a stale/unknown id
 * here is silently skipped rather than treated as a signal to add one.
 */
export function projectToSchema(
  sim: SimState,
  match: MatchState,
  lastProcessedSeq: Readonly<Partial<Record<PlayerId, number>>>,
): void {
  match.tick = sim.tick;

  for (const id of Object.keys(sim.players) as PlayerId[]) {
    const schemaPlayer = match.players.get(id);
    if (!schemaPlayer) {
      continue;
    }
    const simPlayer = sim.players[id]!;
    schemaPlayer.x = simPlayer.pos.x;
    schemaPlayer.y = simPlayer.pos.y;
    const ack = lastProcessedSeq[id];
    if (ack !== undefined) {
      schemaPlayer.lastProcessedSeq = ack;
    }
  }
}
