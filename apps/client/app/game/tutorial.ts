import type { HudPlayerSnapshot } from "./hud.js";

export type TutorialStepId =
  | "move"
  | "jump"
  | "dropThrough"
  | "light"
  | "heavy"
  | "block"
  | "dodge";

export interface TutorialStep {
  id: TutorialStepId;
  /** Short name, for the checklist. */
  title: string;
  /** What to do, with a keyboard. */
  keyboard: string;
  /** What to do, on a touchscreen (the labels on `TouchControls`' buttons). */
  touch: string;
  /** Whether this snapshot of the player's own state shows the step was just done. */
  done: (player: HudPlayerSnapshot) => boolean;
}

/** The floor of the tutorial arena: a body's top is at y 632 standing on it (the platform: 512). */
const FLOOR_TOP = 632;

const isAttacking = (player: HudPlayerSnapshot): boolean => player.action.startsWith("Attack");

/**
 * The lessons, in order. A step counts only when it is the current one, so the fall from the spawn
 * is not "jump", and every step is judged from the player's own synced state (action, attack kind,
 * drop-through timer): the server tracks no lesson progress at all.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "move",
    title: "Move",
    keyboard: "Run left and right with A and D.",
    touch: "Run with the stick on the left.",
    done: (player) => player.action === "Run",
  },
  {
    id: "jump",
    title: "Jump",
    keyboard: "Jump with W or Space. Hold it for a higher jump.",
    touch: "Tap Jump, or hold it for a higher jump.",
    done: (player) => player.action === "Airborne" && !player.grounded,
  },
  {
    id: "dropThrough",
    title: "Drop through",
    keyboard:
      "Hold Jump under the platform to land on it, then press S and Space together to drop through.",
    touch: "Hold Jump under the platform to land on it, then push the stick down and tap Jump.",
    done: (player) => player.dropThroughTicks > 0 && player.y < FLOOR_TOP - 40,
  },
  {
    id: "light",
    title: "Light attack",
    keyboard: "Swing at the dummy with J. Lights are quick and chain.",
    touch: "Tap Light next to the dummy.",
    done: (player) =>
      isAttacking(player) && (player.attackKind === "light" || player.attackKind === "airLight"),
  },
  {
    id: "heavy",
    title: "Heavy attack",
    keyboard: "Now a heavy with K: slower, harder, and it knocks foes back.",
    touch: "Tap Heavy.",
    done: (player) => isAttacking(player) && player.attackKind === "heavy",
  },
  {
    id: "block",
    title: "Block",
    keyboard: "Hold L to block. Blocked hits cost stamina, not health.",
    touch: "Hold Block.",
    done: (player) => player.action === "Block",
  },
  {
    id: "dodge",
    title: "Dodge",
    keyboard: "Press Shift to dodge: you cannot be hit for a moment.",
    touch: "Tap Dodge.",
    done: (player) => player.action === "Dodge",
  },
];

/**
 * Advances the lesson from one snapshot of the player: at most one step per snapshot, and only the
 * current one, so the checklist fills in order. Returns the same set when nothing changed.
 */
export function advanceTutorial(
  done: ReadonlySet<TutorialStepId>,
  player: HudPlayerSnapshot,
): ReadonlySet<TutorialStepId> {
  const current = currentTutorialStep(done);
  if (!current || !current.done(player)) {
    return done;
  }
  return new Set([...done, current.id]);
}

/** The first step not yet done, or `null` when the lesson is over. */
export function currentTutorialStep(done: ReadonlySet<TutorialStepId>): TutorialStep | null {
  return TUTORIAL_STEPS.find((step) => !done.has(step.id)) ?? null;
}
