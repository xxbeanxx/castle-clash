import { useLoaderData } from "react-router";
import { requireSession } from "../auth/requireSession.js";
import {
  getMyMatchHistory,
  getMyStats,
  type ClientStats,
  type MatchHistoryEntry,
} from "../auth/supabase.js";

const MATCH_HISTORY_LIMIT = 20;

export async function clientLoader(): Promise<{
  stats: ClientStats;
  matches: readonly MatchHistoryEntry[];
}> {
  await requireSession();
  const [stats, matches] = await Promise.all([
    getMyStats(),
    getMyMatchHistory(MATCH_HISTORY_LIMIT),
  ]);
  return { stats, matches };
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 80 }}>
      <span style={{ fontSize: 24, fontWeight: "bold" }}>{value}</span>
      <span style={{ fontSize: 12, color: "#aaa" }}>{label}</span>
    </div>
  );
}

export default function Stats() {
  const { stats, matches } = useLoaderData<typeof clientLoader>();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 640 }}>
      <h1>Stats</h1>

      <div style={{ display: "flex", gap: 24 }}>
        <StatTile label="Matches played" value={stats.matchesPlayed} />
        <StatTile label="Wins" value={stats.wins} />
        <StatTile label="Eliminations" value={stats.eliminations} />
        <StatTile label="Deaths" value={stats.deaths} />
        <StatTile label="Rounds won" value={stats.roundsWon} />
      </div>

      <h2>Recent matches</h2>
      {matches.length === 0 ? (
        <p>No matches played yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Date</th>
              <th style={{ textAlign: "left" }}>Result</th>
              <th style={{ textAlign: "left" }}>Weapon</th>
              <th style={{ textAlign: "right" }}>Rounds won</th>
              <th style={{ textAlign: "right" }}>Eliminations</th>
              <th style={{ textAlign: "right" }}>Deaths</th>
              <th style={{ textAlign: "right" }}>Damage</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.matchId}>
                <td>{new Date(match.startedAt).toLocaleDateString()}</td>
                <td>{match.won ? "Win" : "Loss"}</td>
                <td>{match.weapon}</td>
                <td style={{ textAlign: "right" }}>{match.roundsWon}</td>
                <td style={{ textAlign: "right" }}>{match.eliminations}</td>
                <td style={{ textAlign: "right" }}>{match.deaths}</td>
                <td style={{ textAlign: "right" }}>{match.damageDealt.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
