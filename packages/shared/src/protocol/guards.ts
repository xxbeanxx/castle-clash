import type { InputFrame } from "../input/bitmask.js";

export function isInputFrame(value: unknown): value is InputFrame {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.seq === "number" && typeof candidate.bits === "number";
}
