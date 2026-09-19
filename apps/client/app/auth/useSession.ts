import { useEffect, useState } from "react";
import type { Session } from "./supabase.js";

/**
 * The current session for chrome that isn't behind a `clientLoader` guard
 * (the site header). `undefined` while the first read is in flight, so callers
 * can render neither the signed-in nor the signed-out state until they know.
 * A failing read counts as signed out: the header must never break a page.
 *
 * `supabase.js` is imported dynamically so the ~200 KB Supabase client stays
 * off the critical path of public pages: it loads after first paint, and
 * pages that never touch auth (the static ones) still pay for it only here.
 */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    import("./supabase.js").then(
      async ({ getSession, onAuthStateChange }) => {
        if (cancelled) {
          return;
        }
        try {
          unsubscribe = onAuthStateChange((next) => {
            if (!cancelled) {
              setSession(next);
            }
          });
        } catch {
          // Supabase not configured (e.g. a bare dev server): stay on the first read.
        }
        try {
          const initial = await getSession();
          if (!cancelled) {
            setSession((current) => (current === undefined ? initial : current));
          }
        } catch {
          if (!cancelled) {
            setSession((current) => (current === undefined ? null : current));
          }
        }
      },
      () => {
        if (!cancelled) {
          setSession((current) => (current === undefined ? null : current));
        }
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return session;
}
