import { requireSession } from "../auth/requireSession.js";

/** Same placeholder status as `routes/loadout.tsx` — guarded now, real
 *  stats/leaderboard UI (reading `public.leaderboard`) is Phase 9. */
export async function clientLoader(): Promise<null> {
  await requireSession();
  return null;
}

export default function Stats() {
  return <p>Stats and leaderboards are coming in a future update.</p>;
}
