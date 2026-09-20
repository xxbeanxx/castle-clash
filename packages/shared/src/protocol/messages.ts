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
  /** Client to server, from the one human waiting alone in a public quick-play room, after the
   *  server has offered a bot (`MatchState.backfillOfferable`). Payload: `{ tier }`. Never silent:
   *  no bot joins a public room unless a player asks for one (decision D4). */
  BOT_BACKFILL: "bot:backfill",
  /** Server to client, when a human joined and the backfill bot stepped aside. Payload: `{ name }`. */
  BOT_DROPPED: "bot:dropped",
  /** Client to server, from the results screen: "play again with this room". The match restarts
   *  once every human still seated has asked (bots always agree). */
  REMATCH: "match:rematch",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];
