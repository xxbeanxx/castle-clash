import { fnv1a } from "../math/hash.js";

/**
 * Display-name rules, shared so the account form (client), the server, and the
 * database agree. The database enforces the shape (`profiles_display_name_shape`
 * in `supabase/migrations/*_profile_display_names.sql` — keep the two regexes in
 * step); the blocked-word check is client/server-side only, since Postgres has no
 * sensible place for a word list and a determined user can write straight to
 * their own `profiles` row anyway. It is a courtesy floor, not moderation.
 */

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 16;

/** The allow-list: ASCII letters, digits, underscore and hyphen. No spaces, no
 *  Unicode — nothing that can spoof another name or hide in a leaderboard row. */
const NAME_SHAPE = /^[A-Za-z0-9_-]+$/;

/** `Guest-7F3A` and near-spellings. Generated guest labels use this shape, so
 *  nobody may register it as a name. */
const GUEST_SHAPE = /^guest[-_]?[0-9a-f]{4}$/i;

const LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
};

/** Deliberately short and unambiguous: a substring match on a long list blocks
 *  ordinary names. Extend with care and add a "does not block" test alongside. */
const BLOCKED_SUBSTRINGS: readonly string[] = [
  "fuck",
  "shit",
  "cunt",
  "nigg",
  "fagg",
  "bitch",
  "whore",
  "twat",
];

export type DisplayNameProblem =
  | "too_short"
  | "too_long"
  | "bad_characters"
  | "reserved"
  | "blocked";

export type DisplayNameCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: DisplayNameProblem };

function normaliseForBlocklist(name: string): string {
  return name
    .toLowerCase()
    .replace(/[013457]/g, (digit) => LEET[digit] ?? digit)
    .replace(/[-_]/g, "");
}

export function validateDisplayName(raw: string): DisplayNameCheck {
  const name = raw.trim();
  if (name.length < DISPLAY_NAME_MIN) {
    return { ok: false, reason: "too_short" };
  }
  if (name.length > DISPLAY_NAME_MAX) {
    return { ok: false, reason: "too_long" };
  }
  if (!NAME_SHAPE.test(name)) {
    return { ok: false, reason: "bad_characters" };
  }
  if (GUEST_SHAPE.test(name)) {
    return { ok: false, reason: "reserved" };
  }
  const normalised = normaliseForBlocklist(name);
  if (BLOCKED_SUBSTRINGS.some((word) => normalised.includes(word))) {
    return { ok: false, reason: "blocked" };
  }
  return { ok: true, name };
}

/** What a player with no chosen name is called in a match. Derived from their
 *  user id, so it is stable across matches without being stored: a guest's
 *  `profiles.display_name` stays null, which is what keeps guests off the public
 *  leaderboard (plan decision D3). */
export function guestDisplayName(userId: string): string {
  const tag = (fnv1a(userId) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return `Guest-${tag}`;
}
