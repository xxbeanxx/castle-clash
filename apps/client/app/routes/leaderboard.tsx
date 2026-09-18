import type { LeaderboardRow } from "@castle-clash/shared";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { requireSession } from "../auth/requireSession.js";
import { getLeaderboard } from "../auth/supabase.js";

const PAGE_SIZE = 20;

export async function clientLoader(): Promise<{ page: readonly LeaderboardRow[] }> {
  await requireSession();
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 640 }}>
      <h1>Leaderboard</h1>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>#</th>
            <th style={{ textAlign: "left" }}>Player</th>
            <th style={{ textAlign: "right" }}>Wins</th>
            <th style={{ textAlign: "right" }}>Matches</th>
            <th style={{ textAlign: "right" }}>Eliminations</th>
            <th style={{ textAlign: "right" }}>Deaths</th>
          </tr>
        </thead>
        <tbody>
          {page.map((row, index) => (
            <tr key={`${offset}-${index}`}>
              <td>{offset + index + 1}</td>
              <td>{row.display_name ?? "Anonymous"}</td>
              <td style={{ textAlign: "right" }}>{row.wins}</td>
              <td style={{ textAlign: "right" }}>{row.matches_played}</td>
              <td style={{ textAlign: "right" }}>{row.eliminations}</td>
              <td style={{ textAlign: "right" }}>{row.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={loading || offset === 0}
          onClick={() => void goToOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={loading || page.length < PAGE_SIZE}
          onClick={() => void goToOffset(offset + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
