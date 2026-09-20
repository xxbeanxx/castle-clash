import { INPUT_BITS } from "@castle-clash/shared";
import type { InputSource } from "./InputSource.js";

/** The parts of a `Gamepad` the mapping reads, so tests need no real one. */
export interface PadState {
  mapping: string;
  buttons: ReadonlyArray<{ pressed: boolean }>;
  axes: readonly number[];
}

/** Left-stick thresholds: horizontal registers early, DOWN needs a deliberate push (it also drops
 *  through platforms, so an accidental one is costly). */
export const STICK_DEADZONE = 0.35;
export const STICK_DOWN = 0.6;

/** The "standard" mapping (https://w3c.github.io/gamepad/#remapping): 0 A, 1 B, 2 X, 3 Y,
 *  4/5 bumpers, 6/7 triggers, 12-15 d-pad up/down/left/right. */
const BUTTON_TO_BITS: ReadonlyArray<readonly [number, number]> = [
  [0, INPUT_BITS.JUMP],
  [1, INPUT_BITS.DODGE],
  [2, INPUT_BITS.LIGHT],
  [3, INPUT_BITS.HEAVY],
  [4, INPUT_BITS.BLOCK],
  [5, INPUT_BITS.BLOCK],
  [6, INPUT_BITS.BLOCK],
  [7, INPUT_BITS.BLOCK],
  [12, INPUT_BITS.UP],
  [13, INPUT_BITS.DOWN],
  [14, INPUT_BITS.LEFT],
  [15, INPUT_BITS.RIGHT],
];

/** Pure: one pad's state as an input bitmask. A non-standard mapping gets 0 rather than a guess:
 *  a wrong binding is worse than none. */
export function padToBits(pad: PadState): number {
  if (pad.mapping !== "standard") {
    return 0;
  }
  let bits = 0;
  for (const [index, mask] of BUTTON_TO_BITS) {
    if (pad.buttons[index]?.pressed) {
      bits |= mask;
    }
  }
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (x <= -STICK_DEADZONE) {
    bits |= INPUT_BITS.LEFT;
  } else if (x >= STICK_DEADZONE) {
    bits |= INPUT_BITS.RIGHT;
  }
  if (y >= STICK_DOWN) {
    bits |= INPUT_BITS.DOWN;
  }
  return bits;
}

/**
 * Gamepads as an `InputSource` (plan Phase 13 step 11). The Gamepad API is polled, not evented, so
 * `sample()` reads whatever is connected right then: hot-plug needs no handling (a pad that appears
 * is simply found on the next sample), and any number of pads are ORed. Browsers only expose a pad
 * after its first button press, which is fine for play. Unlike keys and touch there is no press
 * event to latch, so a press shorter than one tick is lost; a physical button cannot do that.
 */
export class GamepadInput implements InputSource {
  readonly #getPads: () => ReadonlyArray<PadState | null>;

  constructor(
    getPads: () => ReadonlyArray<PadState | null> = () => navigator.getGamepads?.() ?? [],
  ) {
    this.#getPads = getPads;
  }

  attach(): void {}
  detach(): void {}

  sample(): number {
    let bits = 0;
    for (const pad of this.#getPads()) {
      if (pad) {
        bits |= padToBits(pad);
      }
    }
    return bits;
  }
}
