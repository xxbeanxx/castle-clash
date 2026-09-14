import { describe, expect, it } from "vitest";
import { decode, encode, has, INPUT_BITS } from "./bitmask.js";

describe("bitmask", () => {
  it("round-trips every combination of the 9 known bits through encode/decode", () => {
    const bitNames = Object.keys(INPUT_BITS) as (keyof typeof INPUT_BITS)[];
    for (let combo = 0; combo < 2 ** bitNames.length; combo++) {
      const pressed = bitNames.filter((_, i) => (combo & (1 << i)) !== 0);
      const bits = encode(pressed);
      const decoded = decode(bits);
      expect(new Set(decoded)).toEqual(new Set(pressed));
      for (const name of bitNames) {
        expect(has(bits, name)).toBe(pressed.includes(name));
      }
    }
  });

  it("rejects unknown bits", () => {
    const bogus = 1 << 31;
    expect(() => decode(bogus)).toThrow();
  });
});
