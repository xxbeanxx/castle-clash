import { COSMETIC_CATALOG, type MatchResult } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import type { GameClient } from "../game/GameClient.js";
import type { RoomInfoSnapshot } from "../game/roomInfo.js";
import { Button, ButtonLink } from "./kit/index.js";
import { SaveProgressNudge } from "./SaveProgressNudge.js";

function unlockName(itemId: string): string {
  return COSMETIC_CATALOG.find((item) => item.id === itemId)?.name ?? itemId;
}

/**
 * The plan's Phase 5 gate wants a results screen at the end of a best-of-5 —
 * this renders once `GameClient.subscribeMatchResult` fires (the tick the
 * match-phase FSM reaches `MatchOver`), and is the whole reason a match
 * result is broadcast at all rather than only kept in server-side stats.
 *
 * Phase 14: bots are named as bots, "Play again" restarts the same room (the server waits for every
 * human still seated), and anything the match unlocked is listed here, not just toasted.
 */
export function ResultsOverlay({ client }: { client: GameClient }) {
  const [result, setResult] = useState<MatchResult | null>(null);
  const [info, setInfo] = useState<RoomInfoSnapshot | null>(null);
  const [unlocks, setUnlocks] = useState<readonly string[]>([]);

  useEffect(
    () =>
      client.subscribeMatchResult((next) => {
        setResult(next);
        if (!next) {
          setUnlocks([]);
        }
      }),
    [client],
  );
  useEffect(() => client.subscribeRoomInfo(setInfo), [client]);
  useEffect(() => client.subscribeProfileUnlocks(setUnlocks), [client]);

  if (!result) {
    return null;
  }

  const rows = Object.entries(result.stats);
  const botIds = new Set(info?.botIds ?? []);
  // Never print a raw session id: an older server sends no names, so fall
  // back to the player's position in the table.
  const nameOf = (id: string): string => {
    const name =
      result.names?.[id as keyof typeof result.names] ??
      `Player ${rows.findIndex(([rowId]) => rowId === id) + 1}`;
    return botIds.has(id) ? `${name} (bot)` : name;
  };
  const waiting = info?.wantsRematch ?? false;
  const shared = (info?.humans ?? 1) > 1;

  return (
    <div data-testid="results-overlay" className="cc-overlay">
      <h2 className="cc-overlay__title">
        {result.winner ? `${nameOf(result.winner)} wins!` : "Draw"}
      </h2>
      <table className="cc-results">
        <thead>
          <tr>
            <th>Player</th>
            <th>Rounds</th>
            <th>Eliminations</th>
            <th>Deaths</th>
            <th>Damage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, stats]) => (
            <tr key={id}>
              <td>{nameOf(id)}</td>
              <td>{stats.roundsWon}</td>
              <td>{stats.eliminations}</td>
              <td>{stats.deaths}</td>
              <td>{Math.round(stats.damageDealt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {unlocks.length > 0 && (
        <p data-testid="results-unlocks" role="status" className="cc-results__unlocks">
          Unlocked: {unlocks.map(unlockName).join(", ")}
        </p>
      )}
      <div className="cc-row">
        <Button
          variant="primary"
          disabled={waiting}
          onClick={() => client.requestRematch()}
          data-testid="play-again"
        >
          {waiting ? (shared ? "Waiting for the others…" : "Starting…") : "Play again"}
        </Button>
        <ButtonLink to="/lobby">Back to lobby</ButtonLink>
      </div>
      <SaveProgressNudge />
    </div>
  );
}
