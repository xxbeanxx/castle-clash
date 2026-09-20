import { INPUT_BITS, type InputBitName } from "@castle-clash/shared";
import { HeldBits } from "./HeldBits.js";
import type { InputSource } from "./InputSource.js";

const KEY_TO_BIT: Readonly<Record<string, InputBitName>> = {
  ArrowLeft: "LEFT",
  KeyA: "LEFT",
  ArrowRight: "RIGHT",
  KeyD: "RIGHT",
  ArrowUp: "UP",
  KeyW: "UP",
  ArrowDown: "DOWN",
  KeyS: "DOWN",
  Space: "JUMP",
  KeyJ: "LIGHT",
  KeyK: "HEAVY",
  KeyL: "BLOCK",
  ShiftLeft: "DODGE",
  ShiftRight: "DODGE",
};

/**
 * Tracks held-key state and encodes it to the shared input bitmask.
 * Sampled once per fixed sim tick by `GameClient` — never per render frame,
 * so held input isn't lost or double-counted at a render rate that doesn't
 * match `TICK_RATE`. A key tapped between two samples still registers once
 * (`HeldBits`' latch).
 */
export class KeyboardInput implements InputSource {
  readonly #state = new HeldBits();
  readonly #target: EventTarget;

  constructor(target: EventTarget = globalThis.window) {
    this.#target = target;
  }

  attach(): void {
    this.#target.addEventListener("keydown", this.#onKeyDown as EventListener);
    this.#target.addEventListener("keyup", this.#onKeyUp as EventListener);
  }

  detach(): void {
    this.#target.removeEventListener("keydown", this.#onKeyDown as EventListener);
    this.#target.removeEventListener("keyup", this.#onKeyUp as EventListener);
    this.#state.clear();
  }

  sample(): number {
    return this.#state.sample();
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    const bit = KEY_TO_BIT[event.code];
    if (bit) {
      this.#state.press(event.code, INPUT_BITS[bit]);
    }
  };

  #onKeyUp = (event: KeyboardEvent): void => {
    if (KEY_TO_BIT[event.code]) {
      this.#state.release(event.code);
    }
  };
}
