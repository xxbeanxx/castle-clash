import { useEffect, useState } from "react";
import { PROFILE_CHANGED_EVENT } from "./profileEvents.js";
import type { MyProfile } from "./supabase.js";

interface Loaded {
  readonly userId: string;
  readonly profile: MyProfile | null;
}

/**
 * The signed-in player's profile for chrome that isn't behind a `clientLoader` (the header's account
 * menu). `undefined` while loading and `null` when it can't be read: the menu falls back to a generic
 * label rather than breaking a page. Refetches when the session's user changes and when a name is
 * saved anywhere (`PROFILE_CHANGED_EVENT`). A profile is only returned for the user it was loaded
 * for, so a different user signing in never briefly sees the previous user's name.
 *
 * `supabase.js` is imported dynamically for the same reason `useSession` does: keeping the Supabase
 * client off the landing page's critical path. Pass `null` to skip loading (guests have no name).
 */
export function useProfile(userId: string | null): MyProfile | null | undefined {
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (userId === null) {
      return;
    }
    let cancelled = false;
    import("./supabase.js")
      .then(({ getMyProfile }) => getMyProfile())
      .then(
        (profile) => {
          if (!cancelled) {
            setLoaded({ userId, profile });
          }
        },
        () => {
          // Keep a name we already have for this user; otherwise fall back to a generic label.
          if (!cancelled) {
            setLoaded((current) =>
              current?.userId === userId ? current : { userId, profile: null },
            );
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  if (userId === null) {
    return null;
  }
  return loaded?.userId === userId ? loaded.profile : undefined;
}
