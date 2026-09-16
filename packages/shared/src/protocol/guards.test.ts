import { describe, expect, it } from "vitest";
import { isDraftPick, isInputFrame } from "./guards.js";

describe("isInputFrame", () => {
  it("accepts an object with numeric seq and bits", () => {
    expect(isInputFrame({ seq: 1, bits: 0 })).toBe(true);
  });

  it("accepts extra unrelated fields alongside a valid shape", () => {
    expect(isInputFrame({ seq: 1, bits: 0, extra: true })).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an array", [1, 2]],
    ["a string", "input"],
    ["a number", 42],
    ["missing seq", { bits: 0 }],
    ["missing bits", { seq: 1 }],
    ["non-numeric seq", { seq: "1", bits: 0 }],
    ["non-numeric bits", { seq: 1, bits: "0" }],
  ])("rejects %s", (_label, value) => {
    expect(isInputFrame(value)).toBe(false);
  });
});

describe("isDraftPick", () => {
  it("accepts an object with a string id", () => {
    expect(isDraftPick({ id: "sharpEdge" })).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an array", ["sharpEdge"]],
    ["a string", "sharpEdge"],
    ["missing id", {}],
    ["non-string id", { id: 1 }],
  ])("rejects %s", (_label, value) => {
    expect(isDraftPick(value)).toBe(false);
  });
});
