// No 0/O/1/I/L — visually ambiguous over voice or a phone screen, and this
// code exists specifically so a player can read it aloud or type it in.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/** A 6-character private-room code (plan Phase 5 step 3). `random` is
 *  injectable for a deterministic test; defaults to `Math.random` since this
 *  is server-only matchmaking plumbing, not gameplay-affecting sim state —
 *  ADR 0001's determinism rule doesn't apply here. */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}
