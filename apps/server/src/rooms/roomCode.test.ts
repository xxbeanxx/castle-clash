import { describe, expect, it } from "vitest";
import { generateRoomCode } from "./roomCode.js";

describe("generateRoomCode", () => {
  it("generates a 6-character code from the unambiguous alphabet", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("is deterministic given an injected random source", () => {
    const random = () => 0;
    expect(generateRoomCode(random)).toBe("AAAAAA");
  });

  it("generates different codes across calls (extremely unlikely to collide)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
