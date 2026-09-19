import { INPUT_BITS } from "@castle-clash/shared";
import { HeldBits } from "./HeldBits.js";
import type { InputSource } from "./InputSource.js";

/** The on-screen buttons (the stick drives LEFT/RIGHT/DOWN). */
export type TouchButton = "JUMP" | "LIGHT" | "HEAVY" | "BLOCK" | "DODGE";

export interface TouchStickConfig {
  /** Horizontal travel (CSS px) from the stick's origin before LEFT/RIGHT registers. */
  deadzone: number;
  /** Downward travel (CSS px) that counts as the flick-down for DOWN. */
  downThreshold: number;
  /** The origin trails the finger beyond this distance, so reversing direction costs about
   *  `followRadius + deadzone` of travel rather than a return trip across the screen. Must exceed
   *  `downThreshold`, or DOWN could never register. */
  followRadius: number;
}

export const DEFAULT_STICK_CONFIG: TouchStickConfig = {
  deadzone: 12,
  downThreshold: 22,
  followRadius: 32,
};

interface StickPointer {
  originX: number;
  originY: number;
}

/**
 * Touch as an `InputSource` (plan Phase 13 step 6). Pure: no DOM. `TouchControls` (React, `app/ui`)
 * owns the elements and pointer capture and reports what each pointer id is doing; this class turns
 * that into the shared input bitmask.
 *
 * A pointer has exactly one role: the stick (one at a time, the first to claim it) or one button.
 * Presses go through `HeldBits`, keyed by pointer id, so a tap shorter than one tick still lands
 * (F7) and two fingers on one button do not release it until both lift. Anything that could strand
 * a finger's input (cancel, lost capture, a hidden tab) releases it: a stuck direction is worse
 * than a dropped one.
 */
export class TouchInput implements InputSource {
  readonly #state = new HeldBits();
  readonly #config: TouchStickConfig;
  readonly #target: EventTarget | null;
  /** pointerId -> stick geometry, for the (at most one) pointer steering. */
  readonly #sticks = new Map<number, StickPointer>();
  /** pointerId -> button currently under that pointer. */
  readonly #buttons = new Map<number, TouchButton>();

  /** `visibilityTarget` is the `document` in the browser; omitted in tests that don't need it. */
  constructor(
    config: TouchStickConfig = DEFAULT_STICK_CONFIG,
    visibilityTarget: EventTarget | null = globalThis.document ?? null,
  ) {
    this.#config = config;
    this.#target = visibilityTarget;
  }

  attach(): void {
    this.#target?.addEventListener("visibilitychange", this.#onVisibility);
  }

  detach(): void {
    this.#target?.removeEventListener("visibilitychange", this.#onVisibility);
    this.releaseAll();
  }

  sample(): number {
    return this.#state.sample();
  }

  /** A pointer starts steering at `(x, y)`, which becomes the stick's origin. Ignored if another
   *  pointer already steers or this pointer already holds a button. */
  stickStart(pointerId: number, x: number, y: number): void {
    if (this.#sticks.size > 0 || this.#buttons.has(pointerId)) {
      return;
    }
    this.#sticks.set(pointerId, { originX: x, originY: y });
    this.#applyStick(pointerId, x, y);
  }

  stickMove(pointerId: number, x: number, y: number): void {
    if (this.#sticks.has(pointerId)) {
      this.#applyStick(pointerId, x, y);
    }
  }

  /** Current stick origin and whether it is active, for drawing the stick. */
  stickOrigin(pointerId: number): { x: number; y: number } | null {
    const stick = this.#sticks.get(pointerId);
    return stick ? { x: stick.originX, y: stick.originY } : null;
  }

  /** Buttons currently under at least one pointer, for drawing the pressed state. */
  heldButtons(): ReadonlySet<TouchButton> {
    return new Set(this.#buttons.values());
  }

  /** A pointer went down on a button. */
  buttonDown(pointerId: number, button: TouchButton): void {
    if (this.#sticks.has(pointerId)) {
      return;
    }
    this.#buttons.set(pointerId, button);
    this.#state.press(pointerId, INPUT_BITS[button]);
  }

  /** A held pointer moved: onto another button (`button`), or off every button (`null`). Lets a
   *  thumb slide from Light to Heavy, and releases when it slides off the cluster. A pointer that
   *  did not start on a button is ignored. */
  buttonMove(pointerId: number, button: TouchButton | null): void {
    const current = this.#buttons.get(pointerId);
    if (current === undefined || current === button) {
      return;
    }
    if (button === null) {
      this.#buttons.delete(pointerId);
      this.#state.release(pointerId);
      return;
    }
    this.#buttons.set(pointerId, button);
    this.#state.press(pointerId, INPUT_BITS[button]);
  }

  /** `pointerup`, `pointercancel`, `lostpointercapture`: the pointer is gone, whatever it held. */
  release(pointerId: number): void {
    this.#sticks.delete(pointerId);
    this.#buttons.delete(pointerId);
    this.#state.release(pointerId);
  }

  releaseAll(): void {
    this.#sticks.clear();
    this.#buttons.clear();
    this.#state.clear();
  }

  #applyStick(pointerId: number, x: number, y: number): void {
    const stick = this.#sticks.get(pointerId);
    if (!stick) {
      return;
    }
    const { deadzone, downThreshold, followRadius } = this.#config;
    // The origin trails the finger so it is never more than `followRadius` away.
    stick.originX = Math.min(Math.max(stick.originX, x - followRadius), x + followRadius);
    stick.originY = Math.min(Math.max(stick.originY, y - followRadius), y + followRadius);

    const dx = x - stick.originX;
    const dy = y - stick.originY;
    let bits = 0;
    if (dx <= -deadzone) {
      bits |= INPUT_BITS.LEFT;
    } else if (dx >= deadzone) {
      bits |= INPUT_BITS.RIGHT;
    }
    if (dy >= downThreshold) {
      bits |= INPUT_BITS.DOWN;
    }
    if (bits === 0) {
      this.#state.release(pointerId);
    } else {
      this.#state.press(pointerId, bits);
    }
  }

  #onVisibility = (): void => {
    if (globalThis.document?.visibilityState === "hidden") {
      this.releaseAll();
    }
  };
}
