import type { MatchResult } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import type { GameClient } from "../game/GameClient.js";
import { ButtonLink } from "./kit/index.js";

/**
 * The plan's Phase 5 gate wants a results screen at the end of a best-of-5 —
 * this renders once `GameClient.subscribeMatchResult` fires (the tick the
 * match-phase FSM reaches `MatchOver`), and is the whole reason a match
 * result is broadcast at all rather than only kept in server-side stats.
 */
export function ResultsOverlay({ client }: { client: GameClient }) {
  const [result, setResult] = useState<MatchResult | null>(null);

  useEffect(() => client.subscribeMatchResult(setResult), [client]);

  if (!result) {
    return null;
  }

  const rows = Object.entries(result.stats);
  // Never print a raw session id: an older server sends no names, so fall
  // back to the player's position in the table.
  const nameOf = (id: string): string =>
    result.names?.[id as keyof typeof result.names] ??
    `Player ${rows.findIndex(([rowId]) => rowId === id) + 1}`;

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
      <ButtonLink to="/lobby" variant="primary">
        Return to lobby
      </ButtonLink>
    </div>
  );
}
