import { useEffect, useState } from "react";
import { getSession, onAuthStateChange, type Session } from "./supabase.js";

/**
 * The current session for chrome that isn't behind a `clientLoader` guard
 * (the site header). `undefined` while the first read is in flight, so callers
 * can render neither the signed-in nor the signed-out state until they know.
 * A failing read counts as signed out: the header must never break a page.
 */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getSession().then(
      (initial) => {
        if (!cancelled) {
          setSession((current) => (current === undefined ? initial : current));
        }
      },
      () => {
        if (!cancelled) {
          setSession((current) => (current === undefined ? null : current));
        }
      },
    );
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChange(setSession);
    } catch {
      // Supabase not configured (e.g. a bare dev server): stay on the first read.
    }
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return session;
}
