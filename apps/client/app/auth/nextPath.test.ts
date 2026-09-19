import { describe, expect, it } from "vitest";
import { loginPathFor, safeNextPath } from "./nextPath.js";

describe("safeNextPath", () => {
  it.each([
    ["/lobby", "/lobby"],
    ["/play/new?mode=private&code=ABC123", "/play/new?mode=private&code=ABC123"],
    ["/stats#recent", "/stats#recent"],
    ["/", "/"],
  ])("keeps the same-origin path %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    ["nothing", null],
    ["empty", ""],
    ["an absolute URL", "https://evil.example/x"],
    ["a protocol-relative URL", "//evil.example/x"],
    ["a scheme trick", "javascript:alert(1)"],
    ["a backslash trick", "/\\evil.example"],
    ["a relative path", "lobby"],
    ["the login page itself (a redirect loop)", "/login?next=/lobby"],
  ])("drops %s", (_label, raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });
});

describe("loginPathFor", () => {
  it("encodes the requested path and query into ?next=", () => {
    const request = new Request("https://app.example/play/new?mode=private&code=ABC123");
    expect(loginPathFor(request)).toBe(
      "/login?next=%2Fplay%2Fnew%3Fmode%3Dprivate%26code%3DABC123",
    );
  });

  it("round-trips through safeNextPath", () => {
    const request = new Request("https://app.example/play/new?mode=private&code=ABC123");
    const next = new URL(loginPathFor(request), "https://app.example").searchParams.get("next");
    expect(safeNextPath(next)).toBe("/play/new?mode=private&code=ABC123");
  });
});
