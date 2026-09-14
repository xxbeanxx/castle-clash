export const MESSAGE_TYPES = {
  INPUT: "input",
  FX: "fx",
  DRAFT_OFFER: "draft:offer",
  DRAFT_PICK: "draft:pick",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];
