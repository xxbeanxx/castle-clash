import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetNext, peekNext, rememberNext } from "./pendingNext.js";

describe("pendingNext", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("hands back the remembered path, and keeps it until forgotten", () => {
    rememberNext("/play/new?mode=private&code=ABC123");

    expect(peekNext()).toBe("/play/new?mode=private&code=ABC123");
    // Twice: React StrictMode runs an effect twice, and both runs must see it.
    expect(peekNext()).toBe("/play/new?mode=private&code=ABC123");

    forgetNext();
    expect(peekNext()).toBeNull();
  });

  it("does not remember a destination that leaves the site", () => {
    rememberNext("https://evil.example/x");
    expect(peekNext()).toBeNull();

    rememberNext("//evil.example");
    expect(peekNext()).toBeNull();
  });

  it("re-checks the stored value on the way out, in case storage was tampered with", () => {
    sessionStorage.setItem("cc:auth:next", "https://evil.example/x");

    expect(peekNext()).toBeNull();
  });

  it("forgets an earlier destination when asked to remember none", () => {
    rememberNext("/loadout");
    rememberNext(null);

    expect(peekNext()).toBeNull();
  });

  it("survives storage being unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => rememberNext("/loadout")).not.toThrow();
    expect(peekNext()).toBeNull();
    expect(() => forgetNext()).not.toThrow();
  });
});
