import type { InputFrame } from "../input/bitmask.js";

export function isInputFrame(value: unknown): value is InputFrame {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.seq === "number" && typeof candidate.bits === "number";
}

/** The `draft:pick` message body (plan Phase 7 step 4) — just an id; whether
 *  it's actually one of *that player's* three offers is `DraftService.pick`'s
 *  job, not this shape guard's. */
export interface DraftPickMessage {
  id: string;
}

export function isDraftPick(value: unknown): value is DraftPickMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string";
}
