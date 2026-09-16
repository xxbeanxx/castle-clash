import { createClient, type Session } from "@supabase/supabase-js";
import { getRuntimeConfig } from "../config/runtime.js";

/**
 * The ONLY module in `apps/client` that imports `@supabase/supabase-js`
 * (plan Phase 8 step 6) — every route/component that needs auth calls the
 * functions below instead, so `vi.mock("../auth/supabase.js")` is the one
 * seam a route test needs to fake sign-in state, with no supabase-js
 * internals to know about.
 */

let cached: ReturnType<typeof createClient> | null = null;

function client(): ReturnType<typeof createClient> {
  if (!cached) {
    const config = getRuntimeConfig();
    cached = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  }
  return cached;
}

export type { Session };

export async function getSession(): Promise<Session | null> {
  const { data } = await client().auth.getSession();
  return data.session;
}

/** The bearer token `GameClient.start()` forwards to `MatchRoom.onAuth`.
 *  Always re-reads the current session rather than caching a token itself
 *  — `supabase-js` silently refreshes an expiring access token underneath
 *  `getSession()`, so calling this fresh right before every join (plan step
 *  6: "refreshed before reconnecting") never risks sending a stale one. */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  const {
    data: { subscription },
  } = client().auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

/** Magic-link sign-in — also the upgrade path for an anonymous guest: per
 *  Supabase's own anonymous-user docs, calling this while signed in
 *  anonymously LINKS the email to the existing (same-id) user instead of
 *  creating a new one, so a guest's `player_stats` row (keyed on that same
 *  id) survives the upgrade untouched. */
export async function signInWithMagicLink(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({ email });
  if (error) {
    throw error;
  }
}

export type OAuthProvider = "discord" | "google";

export async function signInWithOAuth(provider: OAuthProvider): Promise<void> {
  // Back to /login specifically, not just the origin: it's the one route
  // that watches `onAuthStateChange` and navigates onward once the
  // redirect hands back a session (see routes/login.tsx's doc comment).
  const { error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/login` },
  });
  if (error) {
    throw error;
  }
}

export async function signInAsGuest(): Promise<void> {
  const { error } = await client().auth.signInAnonymously();
  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  await client().auth.signOut();
}
