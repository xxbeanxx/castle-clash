import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HeldBits } from "./HeldBits.js";

describe("HeldBits", () => {
  it("latches a press and release that both land between samples", () => {
    const state = new HeldBits();
    state.press("a", 0b01);
    state.release("a");
    expect(state.sample()).toBe(0b01);
    expect(state.sample()).toBe(0);
  });

  it("keeps a held press on every sample", () => {
    const state = new HeldBits();
    state.press("a", 0b10);
    expect(state.sample()).toBe(0b10);
    expect(state.sample()).toBe(0b10);
    state.release("a");
    expect(state.sample()).toBe(0);
  });

  it("lets two ids drive one bit independently", () => {
    const state = new HeldBits();
    state.press("a", 0b1);
    state.press("b", 0b1);
    state.sample();
    state.release("a");
    expect(state.sample()).toBe(0b1);
    state.release("b");
    expect(state.sample()).toBe(0);
  });

  it("clear drops held presses and an unsampled latch", () => {
    const state = new HeldBits();
    state.press("a", 0b1);
    state.clear();
    expect(state.sample()).toBe(0);
  });

  it("re-pressing an id replaces its bits rather than stacking them", () => {
    const state = new HeldBits();
    state.press(1, 0b01);
    state.press(1, 0b10);
    state.sample();
    expect(state.sample()).toBe(0b10);
  });

  it("property: after every id is released and one sample is taken, nothing stays held", () => {
    const op = fc.oneof(
      fc.record({
        kind: fc.constant("press" as const),
        id: fc.integer({ min: 0, max: 5 }),
        bits: fc.integer({ min: 1, max: 255 }),
      }),
      fc.record({ kind: fc.constant("release" as const), id: fc.integer({ min: 0, max: 5 }) }),
      fc.record({ kind: fc.constant("sample" as const) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 60 }), (ops) => {
        const state = new HeldBits();
        for (const o of ops) {
          if (o.kind === "press") state.press(o.id, o.bits);
          else if (o.kind === "release") state.release(o.id);
          else state.sample();
        }
        for (let id = 0; id <= 5; id += 1) state.release(id);
        state.sample(); // drains the latch
        return state.sample() === 0;
      }),
    );
  });
});
