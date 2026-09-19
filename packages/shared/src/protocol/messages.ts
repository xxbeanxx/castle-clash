export const MESSAGE_TYPES = {
  INPUT: "input",
  FX: "fx",
  DRAFT_OFFER: "draft:offer",
  DRAFT_PICK: "draft:pick",
  /** Sent once, to the client that created a private room, once
   *  `MatchRoom.onCreate` has generated its 6-character join code. */
  MATCH_CODE: "match:code",
  /** Broadcast once, the tick the match-phase FSM reaches `MatchOver`. */
  MATCH_RESULT: "match:result",
  /** Sent privately (plan Phase 9 step 3), only to a player whose match
   *  result just crossed a `COSMETIC_CATALOG` unlock threshold — payload is
   *  the array of newly-unlocked item ids. Fired once `recordMatch`
   *  actually succeeded, from `apps/server/src/match/unlocks.ts`'s
   *  `evaluateAndGrantUnlocks`, not from the tick loop itself. */
  PROFILE_UNLOCKS: "profile:unlocks",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];
