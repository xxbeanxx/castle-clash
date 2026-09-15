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
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];
