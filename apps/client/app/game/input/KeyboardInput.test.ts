import { INPUT_BITS } from "@castle-clash/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KeyboardInput } from "./KeyboardInput.js";

function keydown(target: EventTarget, code: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { code }));
}

function keyup(target: EventTarget, code: string): void {
  target.dispatchEvent(new KeyboardEvent("keyup", { code }));
}

describe("KeyboardInput", () => {
  let target: EventTarget;
  let input: KeyboardInput;

  beforeEach(() => {
    target = new EventTarget();
    input = new KeyboardInput(target);
    input.attach();
  });

  afterEach(() => {
    input.detach();
  });

  it("samples 0 with nothing held", () => {
    expect(input.sample()).toBe(0);
  });

  it("sets the matching bit while a mapped key is held", () => {
    keydown(target, "ArrowRight");
    expect(input.sample()).toBe(INPUT_BITS.RIGHT);
  });

  it("clears the bit on keyup", () => {
    keydown(target, "ArrowRight");
    keyup(target, "ArrowRight");
    expect(input.sample()).toBe(0);
  });

  it("combines multiple held keys into one bitmask", () => {
    keydown(target, "KeyA"); // LEFT
    keydown(target, "Space"); // JUMP
    expect(input.sample()).toBe(INPUT_BITS.LEFT | INPUT_BITS.JUMP);
  });

  it("ignores unmapped keys", () => {
    keydown(target, "KeyZ");
    expect(input.sample()).toBe(0);
  });

  it("stops reacting to events after detach", () => {
    input.detach();
    keydown(target, "ArrowRight");
    expect(input.sample()).toBe(0);
  });
});
