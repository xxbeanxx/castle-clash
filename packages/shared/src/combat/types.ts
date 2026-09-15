/** The player action state machine's states (Phase 4). `transitions` in
 *  `fsm.ts` covers every state here. */
export type ActionState =
  | "Idle"
  | "Run"
  | "Airborne"
  | "AttackStartup"
  | "AttackActive"
  | "AttackRecovery"
  | "Block"
  | "BlockStun"
  | "Dodge"
  | "HitStun"
  | "GuardBroken"
  | "Dead";

export type AttackKind = "light" | "heavy";

export const ACTION_STATES: readonly ActionState[] = [
  "Idle",
  "Run",
  "Airborne",
  "AttackStartup",
  "AttackActive",
  "AttackRecovery",
  "Block",
  "BlockStun",
  "Dodge",
  "HitStun",
  "GuardBroken",
  "Dead",
];

export function isActionState(value: string): value is ActionState {
  return (ACTION_STATES as readonly string[]).includes(value);
}

export function isAttackKind(value: string): value is AttackKind {
  return value === "light" || value === "heavy";
}
