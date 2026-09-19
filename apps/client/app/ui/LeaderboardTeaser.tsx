import type { LeaderboardRow } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";

const TEASER_SIZE = 10;

type NamedRow = LeaderboardRow & { display_name: string };

/** The query only returns named players, but the column is nullable, so narrow it for the type. */
function named(rows: readonly LeaderboardRow[]): NamedRow[] {
  return rows.filter((row): row is NamedRow => Boolean(row.display_name));
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
    import("../auth/supabase.js")
      .then(({ getLeaderboard }) => getLeaderboard(0, TEASER_SIZE))
      .then(
        (result) => {
          if (!cancelled) {
            setRows(named(result));
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
        {rows.map((row, index) => (
          <li key={`${index}-${row.display_name}`} className="cc-teaser__row">
            <span className="cc-teaser__name">{row.display_name}</span>
            <span className="cc-teaser__wins">{row.wins} wins</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
