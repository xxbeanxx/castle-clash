import { useLoaderData } from "react-router";
import { requireSession } from "../auth/requireSession.js";
import {
  getMyMatchHistory,
  getMyStats,
  type ClientStats,
  type MatchHistoryEntry,
} from "../auth/supabase.js";
import { Panel } from "../ui/kit/index.js";

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
    <div className="cc-stat">
      <span className="cc-stat__value">{value}</span>
      <span className="cc-stat__label">{label}</span>
    </div>
  );
}

export default function Stats() {
  const { stats, matches } = useLoaderData<typeof clientLoader>();

  return (
    <div className="cc-page">
      <h1>Stats</h1>

      <div className="cc-stats">
        <StatTile label="Matches played" value={stats.matchesPlayed} />
        <StatTile label="Wins" value={stats.wins} />
        <StatTile label="Eliminations" value={stats.eliminations} />
        <StatTile label="Deaths" value={stats.deaths} />
        <StatTile label="Rounds won" value={stats.roundsWon} />
      </div>

      <Panel title="Recent matches">
        {matches.length === 0 ? (
          <p className="cc-muted">No matches played yet.</p>
        ) : (
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Result</th>
                  <th>Weapon</th>
                  <th className="cc-num">Rounds won</th>
                  <th className="cc-num">Eliminations</th>
                  <th className="cc-num">Deaths</th>
                  <th className="cc-num">Damage</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.matchId}>
                    <td>{new Date(match.startedAt).toLocaleDateString()}</td>
                    <td>{match.won ? "Win" : "Loss"}</td>
                    <td>{match.weapon}</td>
                    <td className="cc-num">{match.roundsWon}</td>
                    <td className="cc-num">{match.eliminations}</td>
                    <td className="cc-num">{match.deaths}</td>
                    <td className="cc-num">{match.damageDealt.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
