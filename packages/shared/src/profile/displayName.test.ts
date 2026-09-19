import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  guestDisplayName,
  validateDisplayName,
} from "./displayName.js";

describe("validateDisplayName", () => {
  it("accepts a plain name and returns it trimmed", () => {
    expect(validateDisplayName("  Sir_Lancelot ")).toEqual({ ok: true, name: "Sir_Lancelot" });
  });

  it.each(["abc", "a-b_c", "Knight99", "x".repeat(DISPLAY_NAME_MAX)])("accepts %s", (name) => {
    expect(validateDisplayName(name).ok).toBe(true);
  });

  it(`rejects names shorter than ${DISPLAY_NAME_MIN}`, () => {
    expect(validateDisplayName("ab")).toEqual({ ok: false, reason: "too_short" });
    expect(validateDisplayName("   ")).toEqual({ ok: false, reason: "too_short" });
  });

  it(`rejects names longer than ${DISPLAY_NAME_MAX}`, () => {
    expect(validateDisplayName("x".repeat(DISPLAY_NAME_MAX + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it.each(["has space", "dot.name", "émile", "<b>bold</b>", "name​", "a/b", "😀😀😀"])(
    "rejects the characters in %j",
    (name) => {
      expect(validateDisplayName(name)).toEqual({ ok: false, reason: "bad_characters" });
    },
  );

  it("rejects the reserved Guest-XXXX shape, so no one can pose as a guest label", () => {
    expect(validateDisplayName("Guest-7F3A")).toEqual({ ok: false, reason: "reserved" });
    expect(validateDisplayName("guest_7f3a")).toEqual({ ok: false, reason: "reserved" });
    expect(validateDisplayName("guest7f3a")).toEqual({ ok: false, reason: "reserved" });
    // Not the reserved shape: a longer tail is an ordinary name.
    expect(validateDisplayName("Guest-7F3A1").ok).toBe(true);
  });

  it("rejects names containing a blocked word, through common disguises", () => {
    expect(validateDisplayName("fuck")).toEqual({ ok: false, reason: "blocked" });
    expect(validateDisplayName("FUCK_you")).toEqual({ ok: false, reason: "blocked" });
    expect(validateDisplayName("f-u-c-k")).toEqual({ ok: false, reason: "blocked" });
    expect(validateDisplayName("sh1t_lord")).toEqual({ ok: false, reason: "blocked" });
  });

  it("does not block innocent names that merely resemble a blocked word", () => {
    expect(validateDisplayName("Knight_of_Ash").ok).toBe(true);
    expect(validateDisplayName("Hancock_the_Bold").ok).toBe(true);
  });
});

describe("guestDisplayName", () => {
  it("is deterministic for a user id and shaped Guest-XXXX", () => {
    const id = "3f1c9c34-7d0b-4e37-9a55-0d5f4d0f1a22";
    expect(guestDisplayName(id)).toBe(guestDisplayName(id));
    expect(guestDisplayName(id)).toMatch(/^Guest-[0-9A-F]{4}$/);
  });

  it("differs between users", () => {
    const names = new Set(
      Array.from({ length: 50 }, (_, i) => guestDisplayName(`00000000-0000-4000-8000-${i}`)),
    );
    expect(names.size).toBeGreaterThan(40);
  });

  it("is always a shape validateDisplayName reserves", () => {
    expect(validateDisplayName(guestDisplayName("anything"))).toEqual({
      ok: false,
      reason: "reserved",
    });
  });
});
