import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markTutorialSeen, tutorialSeen, tutorialUrl } from "./tutorialSeen.js";

describe("tutorialSeen", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("is false on a first visit and true once marked", () => {
    expect(tutorialSeen()).toBe(false);
    markTutorialSeen();
    expect(tutorialSeen()).toBe(true);
  });

  it("never traps a visitor in the tutorial when storage is unavailable: it counts as seen", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(tutorialSeen()).toBe(true);
  });

  it("does not throw when it cannot remember", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => markTutorialSeen()).not.toThrow();
  });
});

describe("tutorialUrl", () => {
  it("carries where to go afterwards, encoded", () => {
    expect(tutorialUrl("/play/new")).toBe("/play/new?mode=tutorial&next=%2Fplay%2Fnew");
    expect(tutorialUrl("/play/new?mode=practice&bots=1")).toBe(
      "/play/new?mode=tutorial&next=%2Fplay%2Fnew%3Fmode%3Dpractice%26bots%3D1",
    );
  });
});
