/**
 * The keyboard scheme, mirroring `game/input/KeyboardInput.ts`'s `KEY_TO_BIT`.
 * (That map is keyed by `KeyboardEvent.code` and lives below the no-React
 * boundary; this is the player-facing description of the same bindings.)
 */
export const CONTROLS: ReadonlyArray<{ keys: readonly string[]; action: string }> = [
  { keys: ["A", "D"], action: "Move" },
  { keys: ["W", "Space"], action: "Jump" },
  { keys: ["S"], action: "Drop through a platform" },
  { keys: ["J"], action: "Light attack" },
  { keys: ["K"], action: "Heavy attack" },
  { keys: ["L"], action: "Block" },
  { keys: ["Shift"], action: "Dodge" },
];
