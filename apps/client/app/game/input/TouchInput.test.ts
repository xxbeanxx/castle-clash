import { INPUT_BITS } from "@castle-clash/shared";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_STICK_CONFIG, TouchInput } from "./TouchInput.js";

const { deadzone, downThreshold, followRadius } = DEFAULT_STICK_CONFIG;

describe("TouchInput", () => {
  let input: TouchInput;

  beforeEach(() => {
    input = new TouchInput(DEFAULT_STICK_CONFIG, new EventTarget());
  });

  it("samples 0 with no touches", () => {
    expect(input.sample()).toBe(0);
  });

  it("keeps DOWN reachable: the follow radius exceeds the down threshold", () => {
    expect(followRadius).toBeGreaterThan(downThreshold);
  });

  describe("stick", () => {
    it("ignores movement inside the deadzone", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 100 + deadzone - 1, 100);
      expect(input.sample()).toBe(0);
    });

    it("registers RIGHT and LEFT at exactly the deadzone", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 100 + deadzone, 100);
      expect(input.sample()).toBe(INPUT_BITS.RIGHT);
      input.stickMove(1, 100 - deadzone, 100);
      expect(input.sample()).toBe(INPUT_BITS.LEFT);
    });

    it("registers DOWN on a flick down, alone or with a direction", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 100, 100 + downThreshold);
      expect(input.sample()).toBe(INPUT_BITS.DOWN);
      input.stickMove(1, 100 + deadzone, 100 + downThreshold);
      expect(input.sample()).toBe(INPUT_BITS.DOWN | INPUT_BITS.RIGHT);
    });

    it("does not register UP (Jump is a button)", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 100, 0);
      expect(input.sample()).toBe(0);
    });

    it("releases the direction when the finger returns to the origin", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 140, 100);
      input.sample();
      input.stickMove(1, 100 + (140 - 100 - followRadius), 100);
      expect(input.sample()).toBe(0);
    });

    it("trails the origin so a reversal costs followRadius + deadzone, not the whole drag", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 500, 100); // a long drag right
      expect(input.sample()).toBe(INPUT_BITS.RIGHT);
      input.stickMove(1, 500 - followRadius - deadzone, 100);
      expect(input.sample()).toBe(INPUT_BITS.LEFT);
    });

    it("holds a direction on every sample while the finger stays put", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 140, 100);
      expect(input.sample()).toBe(INPUT_BITS.RIGHT);
      expect(input.sample()).toBe(INPUT_BITS.RIGHT);
    });

    it("stops when the pointer lifts", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 140, 100);
      input.sample();
      input.release(1);
      expect(input.sample()).toBe(0);
    });

    it("lets only one pointer steer", () => {
      input.stickStart(1, 100, 100);
      input.stickStart(2, 300, 100);
      input.stickMove(2, 400, 100);
      expect(input.sample()).toBe(0);
      expect(input.stickOrigin(2)).toBeNull();
    });
  });

  describe("buttons", () => {
    it("holds a button while its pointer is down", () => {
      input.buttonDown(1, "JUMP");
      expect(input.sample()).toBe(INPUT_BITS.JUMP);
      expect(input.sample()).toBe(INPUT_BITS.JUMP);
      input.release(1);
      expect(input.sample()).toBe(0);
    });

    it("registers a tap that both lands and lifts between two samples (F7)", () => {
      input.buttonDown(1, "LIGHT");
      input.release(1);
      expect(input.sample()).toBe(INPUT_BITS.LIGHT);
      expect(input.sample()).toBe(0);
    });

    it("handles two simultaneous pointers: stick and button", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 140, 100);
      input.buttonDown(2, "JUMP");
      expect(input.sample()).toBe(INPUT_BITS.RIGHT | INPUT_BITS.JUMP);
      input.release(2);
      expect(input.sample()).toBe(INPUT_BITS.RIGHT);
    });

    it("handles several buttons at once (block + dodge)", () => {
      input.buttonDown(1, "BLOCK");
      input.buttonDown(2, "DODGE");
      expect(input.sample()).toBe(INPUT_BITS.BLOCK | INPUT_BITS.DODGE);
    });

    it("keeps a button held until every finger on it lifts", () => {
      input.buttonDown(1, "BLOCK");
      input.buttonDown(2, "BLOCK");
      input.sample();
      input.release(1);
      expect(input.sample()).toBe(INPUT_BITS.BLOCK);
      input.release(2);
      expect(input.sample()).toBe(0);
    });

    it("moves a held pointer to another button, and off the cluster releases", () => {
      input.buttonDown(1, "LIGHT");
      input.sample();
      input.buttonMove(1, "HEAVY");
      expect(input.sample()).toBe(INPUT_BITS.HEAVY);
      input.buttonMove(1, null);
      expect(input.sample()).toBe(0);
    });

    it("does not let a pointer that started off a button press one by sliding onto it", () => {
      input.buttonMove(9, "JUMP");
      expect(input.sample()).toBe(0);
    });

    it("reports which buttons are held, following slides and releases", () => {
      input.buttonDown(1, "LIGHT");
      input.buttonDown(2, "BLOCK");
      expect([...input.heldButtons()].sort()).toEqual(["BLOCK", "LIGHT"]);
      input.buttonMove(1, "HEAVY");
      input.release(2);
      expect([...input.heldButtons()]).toEqual(["HEAVY"]);
    });

    it("does not let a stick pointer also press a button", () => {
      input.stickStart(1, 100, 100);
      input.buttonDown(1, "JUMP");
      expect(input.sample()).toBe(0);
    });
  });

  describe("everything is released, never stuck", () => {
    it("pointercancel (release) frees the stick and buttons", () => {
      input.stickStart(1, 100, 100);
      input.stickMove(1, 150, 100);
      input.buttonDown(2, "HEAVY");
      input.release(1);
      input.release(2);
      input.sample();
      expect(input.sample()).toBe(0);
    });

    it("releaseAll drops held and unsampled presses", () => {
      input.buttonDown(1, "JUMP");
      input.releaseAll();
      expect(input.sample()).toBe(0);
    });

    it("a hidden tab releases everything", () => {
      const target = new EventTarget();
      const touch = new TouchInput(DEFAULT_STICK_CONFIG, target);
      touch.attach();
      touch.buttonDown(1, "JUMP");
      const original = Object.getOwnPropertyDescriptor(document, "visibilityState");
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      try {
        target.dispatchEvent(new Event("visibilitychange"));
        expect(touch.sample()).toBe(0);
      } finally {
        if (original) {
          Object.defineProperty(document, "visibilityState", original);
        } else {
          Reflect.deleteProperty(document, "visibilityState");
        }
      }
    });

    it("a visible tab does not release", () => {
      const target = new EventTarget();
      const touch = new TouchInput(DEFAULT_STICK_CONFIG, target);
      touch.attach();
      touch.buttonDown(1, "JUMP");
      target.dispatchEvent(new Event("visibilitychange"));
      expect(touch.sample()).toBe(INPUT_BITS.JUMP);
    });

    it("detach releases and stops listening", () => {
      input.buttonDown(1, "JUMP");
      input.detach();
      expect(input.sample()).toBe(0);
    });
  });

  it("property: any pointer sequence ends with zero bits once every pointer lifts", () => {
    const pointer = fc.integer({ min: 0, max: 4 });
    const button = fc.constantFrom("JUMP", "LIGHT", "HEAVY", "BLOCK", "DODGE", null);
    const coord = fc.integer({ min: -400, max: 1400 });
    const op = fc.oneof(
      fc.record({ kind: fc.constant("stickStart" as const), id: pointer, x: coord, y: coord }),
      fc.record({ kind: fc.constant("stickMove" as const), id: pointer, x: coord, y: coord }),
      fc.record({ kind: fc.constant("buttonDown" as const), id: pointer, b: button }),
      fc.record({ kind: fc.constant("buttonMove" as const), id: pointer, b: button }),
      fc.record({ kind: fc.constant("release" as const), id: pointer }),
      fc.record({ kind: fc.constant("sample" as const) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 80 }), (ops) => {
        const touch = new TouchInput(DEFAULT_STICK_CONFIG, new EventTarget());
        for (const o of ops) {
          switch (o.kind) {
            case "stickStart":
              touch.stickStart(o.id, o.x, o.y);
              break;
            case "stickMove":
              touch.stickMove(o.id, o.x, o.y);
              break;
            case "buttonDown":
              if (o.b) touch.buttonDown(o.id, o.b);
              break;
            case "buttonMove":
              touch.buttonMove(o.id, o.b);
              break;
            case "release":
              touch.release(o.id);
              break;
            case "sample":
              touch.sample();
              break;
          }
        }
        for (let id = 0; id <= 4; id += 1) touch.release(id);
        touch.sample(); // drains the tap latch
        return touch.sample() === 0;
      }),
    );
  });
});
