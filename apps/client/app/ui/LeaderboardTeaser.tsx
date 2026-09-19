import type { LeaderboardRow } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getLeaderboard } from "../auth/supabase.js";

const TEASER_SIZE = 10;
/** Over-fetch so that skipping unnamed rows still leaves a full list. */
const FETCH_SIZE = 40;

type NamedRow = LeaderboardRow & { display_name: string };

/** Only players who chose a name: guests have none, and "Anonymous" ten times over says nothing. */
export function namedTopRows(rows: readonly LeaderboardRow[], limit = TEASER_SIZE): NamedRow[] {
  return rows.filter((row): row is NamedRow => Boolean(row.display_name)).slice(0, limit);
}

/**
 * The front page's top-10. Renders nothing at all until it has real names to
 * show, and nothing if the read fails: an empty or broken leaderboard is worse
 * on a landing page than none.
 */
export function LeaderboardTeaser() {
  const [rows, setRows] = useState<NamedRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLeaderboard(0, FETCH_SIZE).then(
      (result) => {
        if (!cancelled) {
          setRows(namedTopRows(result));
        }
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || rows.length === 0) {
    return null;
  }

  return (
    <section className="cc-section" aria-labelledby="leaderboard-heading">
      <div className="cc-section__head">
        <h2 id="leaderboard-heading">Hall of champions</h2>
        <Link to="/leaderboard">Full leaderboard</Link>
      </div>
      <ol className="cc-teaser">
        {rows.map((row) => (
          <li key={row.display_name} className="cc-teaser__row">
            <span className="cc-teaser__name">{row.display_name}</span>
            <span className="cc-teaser__wins">{row.wins} wins</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
