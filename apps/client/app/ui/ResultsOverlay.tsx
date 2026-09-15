import type { MatchResult } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { GameClient } from "../game/GameClient.js";

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

  return (
    <div
      data-testid="results-overlay"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        fontFamily: "sans-serif",
      }}
    >
      <h2 style={{ margin: 0 }}>{result.winner ? `${result.winner} wins!` : "Draw"}</h2>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ padding: "4px 12px", textAlign: "left" }}>Player</th>
            <th style={{ padding: "4px 12px" }}>Rounds</th>
            <th style={{ padding: "4px 12px" }}>Eliminations</th>
            <th style={{ padding: "4px 12px" }}>Deaths</th>
            <th style={{ padding: "4px 12px" }}>Damage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, stats]) => (
            <tr key={id}>
              <td style={{ padding: "4px 12px" }}>{id}</td>
              <td style={{ padding: "4px 12px", textAlign: "center" }}>{stats.roundsWon}</td>
              <td style={{ padding: "4px 12px", textAlign: "center" }}>{stats.eliminations}</td>
              <td style={{ padding: "4px 12px", textAlign: "center" }}>{stats.deaths}</td>
              <td style={{ padding: "4px 12px", textAlign: "center" }}>{Math.round(stats.damageDealt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link to="/lobby" style={{ color: "#fff" }}>
        Return to lobby
      </Link>
    </div>
  );
}
