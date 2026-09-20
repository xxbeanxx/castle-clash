import { INPUT_BITS } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import {
  GamepadInput,
  padToBits,
  type PadState,
  STICK_DEADZONE,
  STICK_DOWN,
} from "./GamepadInput.js";

function pad(pressed: number[] = [], axes: number[] = [0, 0], mapping = "standard"): PadState {
  return {
    mapping,
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index) })),
  };
}

describe("padToBits", () => {
  it("maps face buttons and bumpers", () => {
    expect(padToBits(pad([0]))).toBe(INPUT_BITS.JUMP);
    expect(padToBits(pad([2]))).toBe(INPUT_BITS.LIGHT);
    expect(padToBits(pad([3]))).toBe(INPUT_BITS.HEAVY);
    expect(padToBits(pad([1]))).toBe(INPUT_BITS.DODGE);
    expect(padToBits(pad([4]))).toBe(INPUT_BITS.BLOCK);
    expect(padToBits(pad([7]))).toBe(INPUT_BITS.BLOCK);
  });

  it("maps the d-pad", () => {
    expect(padToBits(pad([14]))).toBe(INPUT_BITS.LEFT);
    expect(padToBits(pad([15]))).toBe(INPUT_BITS.RIGHT);
    expect(padToBits(pad([13]))).toBe(INPUT_BITS.DOWN);
    expect(padToBits(pad([12]))).toBe(INPUT_BITS.UP);
  });

  it("applies the left-stick deadzone", () => {
    expect(padToBits(pad([], [STICK_DEADZONE - 0.01, 0]))).toBe(0);
    expect(padToBits(pad([], [STICK_DEADZONE, 0]))).toBe(INPUT_BITS.RIGHT);
    expect(padToBits(pad([], [-STICK_DEADZONE, 0]))).toBe(INPUT_BITS.LEFT);
  });

  it("needs a deliberate push for DOWN, and never maps stick-up", () => {
    expect(padToBits(pad([], [0, STICK_DOWN - 0.01]))).toBe(0);
    expect(padToBits(pad([], [0, STICK_DOWN]))).toBe(INPUT_BITS.DOWN);
    expect(padToBits(pad([], [0, -1]))).toBe(0);
  });

  it("combines stick and buttons", () => {
    expect(padToBits(pad([0], [1, 0]))).toBe(INPUT_BITS.JUMP | INPUT_BITS.RIGHT);
  });

  it("ignores a non-standard mapping", () => {
    expect(padToBits(pad([0, 2], [1, 1], ""))).toBe(0);
  });

  it("tolerates a pad with missing axes or buttons", () => {
    expect(padToBits({ mapping: "standard", buttons: [], axes: [] })).toBe(0);
  });
});

describe("GamepadInput", () => {
  it("ORs every connected pad and skips empty slots", () => {
    const input = new GamepadInput(() => [null, pad([0]), pad([2]), null]);
    expect(input.sample()).toBe(INPUT_BITS.JUMP | INPUT_BITS.LIGHT);
  });

  it("finds a pad that appears later without any event (hot-plug)", () => {
    let pads: Array<PadState | null> = [];
    const input = new GamepadInput(() => pads);
    expect(input.sample()).toBe(0);
    pads = [pad([15])];
    expect(input.sample()).toBe(INPUT_BITS.RIGHT);
    pads = [null];
    expect(input.sample()).toBe(0);
  });

  it("samples 0 when the Gamepad API is missing", () => {
    expect(new GamepadInput(() => []).sample()).toBe(0);
  });
});
