import type { LeaderboardRow } from "@castle-clash/shared";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { getLeaderboard } from "../auth/supabase.js";
import { Button, Panel } from "../ui/kit/index.js";
import { pageMeta } from "../meta.js";

export const meta = () =>
  pageMeta({
    title: "Leaderboard",
    path: "/leaderboard",
    description: "The top Castle Clash players, ranked by match wins.",
  });

const PAGE_SIZE = 20;

export async function clientLoader(): Promise<{ page: readonly LeaderboardRow[] }> {
  const page = await getLeaderboard(0, PAGE_SIZE);
  return { page };
}

export default function Leaderboard() {
  const { page: initialPage } = useLoaderData<typeof clientLoader>();
  const [page, setPage] = useState<readonly LeaderboardRow[]>(initialPage);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  async function goToOffset(nextOffset: number): Promise<void> {
    setLoading(true);
    try {
      const rows = await getLeaderboard(nextOffset, PAGE_SIZE);
      setPage(rows);
      setOffset(nextOffset);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cc-page">
      <h1>Leaderboard</h1>

      <Panel>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th className="cc-num">Wins</th>
                <th className="cc-num">Matches</th>
                <th className="cc-num">Eliminations</th>
                <th className="cc-num">Deaths</th>
              </tr>
            </thead>
            <tbody>
              {page.map((row, index) => (
                <tr key={`${offset}-${index}`}>
                  <td>{offset + index + 1}</td>
                  <td>{row.display_name ?? "Anonymous"}</td>
                  <td className="cc-num">{row.wins}</td>
                  <td className="cc-num">{row.matches_played}</td>
                  <td className="cc-num">{row.eliminations}</td>
                  <td className="cc-num">{row.deaths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cc-row">
          <Button
            size="sm"
            disabled={loading || offset === 0}
            onClick={() => void goToOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            disabled={loading || page.length < PAGE_SIZE}
            onClick={() => void goToOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </Panel>
    </div>
  );
}
