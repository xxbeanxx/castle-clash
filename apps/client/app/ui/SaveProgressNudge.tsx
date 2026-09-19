import { useState } from "react";
import { signInWithGoogle } from "../auth/supabase.js";
import { useSession } from "../auth/useSession.js";
import { Button } from "./kit/index.js";

const DISMISSED_KEY = "cc:nudge:save-progress";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
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
  const session = useSession();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session?.user.is_anonymous || dismissed) {
    return null;
  }

  function dismiss(): void {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
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
