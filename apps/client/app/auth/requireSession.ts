import { redirect } from "react-router";
import { loginPathFor } from "./nextPath.js";
import { getSession, type Session } from "./supabase.js";

/**
 * Shared `clientLoader` guard (plan Phase 8 step 6) for `lobby`, `play`,
 * `loadout`, and `stats` — each route's `clientLoader` just calls this with
 * the loader's `request` and lets the thrown redirect propagate; react-router
 * treats a loader that throws a `Response` as a redirect, not an error.
 *
 * The redirect carries `?next=<path and query>` so sign-in can return the
 * visitor to where they were going (a private-room link, say) instead of the
 * lobby. `routes/login.tsx` reads it through `safeNextPath`.
 */
export async function requireSession(request: Request): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw redirect(loginPathFor(request));
  }
  return session;
}
