import { safeNextPath } from "./nextPath.js";

const KEY = "cc:auth:next";

/**
 * Where to send the player once a Google round trip finishes.
 *
 * Kept in `sessionStorage`, not in the OAuth `redirectTo`: Supabase glob-matches a redirect URL
 * against its allow-list including the query string, so `/auth/callback?next=...` would not match
 * an exact `/auth/callback` entry and would silently fall back to the site URL (research note
 * `phase12-supabase-google-oauth.md`, finding 11). `sessionStorage` is per tab and survives the
 * navigation to Google and back, which is all this needs.
 *
 * Reading does not consume: React StrictMode runs effects twice in dev, and a read that cleared
 * the value would hand the second run `null`. The caller `forgetNext()`s once it has navigated.
 *
 * Every read and write is guarded: storage can throw (private windows, blocked site data), and a
 * lost `next` just means landing on the lobby.
 */
export function rememberNext(path: string | null | undefined): void {
  const safe = safeNextPath(path);
  try {
    if (safe) {
      sessionStorage.setItem(KEY, safe);
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch {
    // Storage unavailable: fall back to the default destination.
  }
}

/** The remembered destination, re-validated in case storage was tampered with. */
export function peekNext(): string | null {
  try {
    return safeNextPath(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function forgetNext(): void {
  rememberNext(null);
}
