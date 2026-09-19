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
    input.sample();
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

  it.each([
    ["KeyJ", "LIGHT"],
    ["KeyK", "HEAVY"],
    ["KeyL", "BLOCK"],
    ["ShiftLeft", "DODGE"],
    ["ShiftRight", "DODGE"],
  ] as const)("maps %s to %s", (code, bitName) => {
    keydown(target, code);
    expect(input.sample()).toBe(INPUT_BITS[bitName]);
  });

  it("stops reacting to events after detach", () => {
    input.detach();
    keydown(target, "ArrowRight");
    expect(input.sample()).toBe(0);
  });

  it("registers a key pressed and released between two samples (F7)", () => {
    keydown(target, "Space");
    keyup(target, "Space");
    expect(input.sample()).toBe(INPUT_BITS.JUMP);
    expect(input.sample()).toBe(0);
  });

  it("reports a tapped key once, not on every later sample", () => {
    keydown(target, "KeyJ");
    keyup(target, "KeyJ");
    input.sample();
    keydown(target, "KeyK");
    expect(input.sample()).toBe(INPUT_BITS.HEAVY);
  });

  it("keeps a held key reported on every sample", () => {
    keydown(target, "ArrowRight");
    expect(input.sample()).toBe(INPUT_BITS.RIGHT);
    expect(input.sample()).toBe(INPUT_BITS.RIGHT);
  });

  it("does not release LEFT when only one of two LEFT keys is released", () => {
    keydown(target, "KeyA");
    keydown(target, "ArrowLeft");
    input.sample();
    keyup(target, "ArrowLeft");
    expect(input.sample()).toBe(INPUT_BITS.LEFT);
  });

  it("forgets held keys on detach so re-attaching starts clean", () => {
    keydown(target, "ArrowRight");
    input.detach();
    input.attach();
    expect(input.sample()).toBe(0);
  });
});
