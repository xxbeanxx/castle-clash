import { useEffect, useState } from "react";
import { getSession, signInWithGoogle, type Session } from "../auth/supabase.js";
import { Button } from "./kit/index.js";

/** Per user, so dismissing it as one guest doesn't hide it from the next guest on this browser. */
const dismissedKey = (userId: string) => `cc:nudge:save-progress:${userId}`;

function wasDismissed(userId: string | undefined): boolean {
  if (!userId) {
    return false;
  }
  try {
    return localStorage.getItem(dismissedKey(userId)) === "1";
  } catch {
    return false;
  }
}

/**
 * "Save your progress", shown to a guest on the results screen: after a match is when a guest has
 * something to lose. Dismissible and remembered, and never in the way: it sits below the results and
 * the way back to the lobby stays where it was. Nothing is shown to anyone who isn't a guest, or
 * while the session is still loading.
 *
 * Google only: upgrading a guest by email is a different call (`updateUser({ email })`) that has not
 * been verified against the hosted project yet.
 */
export function SaveProgressNudge() {
  // Reads the session itself rather than through `useSession`: this lives in the play route, which
  // already loads supabase.js, and sharing that hook with the site header made the bundler split it
  // into its own chunk, an extra request on every landing-page load (measured: ~+100 ms LCP).
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getSession().then(
      (current) => {
        if (!cancelled) {
          setSession(current);
        }
      },
      () => {
        if (!cancelled) {
          setSession(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const userId = session?.user.id;
  // Remembered in memory too, so it still goes away this visit if storage is blocked.
  const [dismissedNow, setDismissedNow] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session?.user.is_anonymous || dismissedNow === userId || wasDismissed(userId)) {
    return null;
  }

  function dismiss(): void {
    setDismissedNow(userId ?? null);
    try {
      localStorage.setItem(dismissedKey(session!.user.id), "1");
    } catch {
      // Dismissed for this visit only.
    }
  }

  async function save(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      await signInWithGoogle("/lobby");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t start Google sign-in");
      setPending(false);
    }
  }

  return (
    <aside className="cc-nudge" aria-label="Save your progress">
      <p className="cc-nudge__title">Save your progress</p>
      <p className="cc-muted">
        Link a Google account to keep your stats and unlocks, and to pick a name for the
        leaderboard.
      </p>
      <div className="cc-row">
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={pending}>
          Continue with Google
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Not now
        </Button>
      </div>
      {error && (
        <p role="alert" className="cc-alert">
          {error}
        </p>
      )}
    </aside>
  );
}
