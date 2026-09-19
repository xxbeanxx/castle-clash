import { redirect } from "react-router";
import { getSession, type Session } from "./supabase.js";

/**
 * Shared `clientLoader` guard (plan Phase 8 step 6) for `lobby`, `play`,
 * `loadout`, and `stats` — each route's `clientLoader` just calls this and
 * lets the thrown redirect propagate; react-router treats a loader that
 * throws a `Response` as a redirect, not an error.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw redirect("/login");
  }
  return session;
}
