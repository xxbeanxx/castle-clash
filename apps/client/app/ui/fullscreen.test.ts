import { afterEach, describe, expect, it, vi } from "vitest";
import { canFullscreen, isFullscreen, toggleFullscreen } from "./fullscreen.js";

function fakeDoc(overrides: Record<string, unknown> = {}) {
  const requestFullscreen = vi.fn().mockResolvedValue(undefined);
  const exitFullscreen = vi.fn().mockResolvedValue(undefined);
  const doc = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    documentElement: { requestFullscreen },
    exitFullscreen,
    ...overrides,
  };
  return { doc: doc as unknown as Document, requestFullscreen, exitFullscreen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canFullscreen", () => {
  it("is true only when the API says so (iPhone Safari does not)", () => {
    expect(canFullscreen(fakeDoc().doc)).toBe(true);
    expect(canFullscreen(fakeDoc({ fullscreenEnabled: false }).doc)).toBe(false);
    expect(canFullscreen(fakeDoc({ fullscreenEnabled: undefined }).doc)).toBe(false);
  });
});

describe("toggleFullscreen", () => {
  it("enters fullscreen and asks for landscape", async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("screen", { orientation: { lock, unlock: vi.fn() } });
    const { doc, requestFullscreen } = fakeDoc();
    await toggleFullscreen(doc);
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("leaves fullscreen and unlocks when already fullscreen", async () => {
    const unlock = vi.fn();
    vi.stubGlobal("screen", { orientation: { lock: vi.fn(), unlock } });
    const { doc, exitFullscreen } = fakeDoc({ fullscreenElement: {} });
    expect(isFullscreen(doc)).toBe(true);
    await toggleFullscreen(doc);
    expect(exitFullscreen).toHaveBeenCalled();
    expect(unlock).toHaveBeenCalled();
  });

  it("works where orientation lock does not exist (iOS)", async () => {
    vi.stubGlobal("screen", { orientation: {} });
    const { doc, requestFullscreen } = fakeDoc();
    await expect(toggleFullscreen(doc)).resolves.toBeUndefined();
    expect(requestFullscreen).toHaveBeenCalled();
  });

  it("swallows a rejected fullscreen request", async () => {
    vi.stubGlobal("screen", { orientation: { lock: vi.fn() } });
    const { doc } = fakeDoc();
    (doc.documentElement.requestFullscreen as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("not allowed"),
    );
    await expect(toggleFullscreen(doc)).resolves.toBeUndefined();
  });

  it("swallows a rejected orientation lock", async () => {
    vi.stubGlobal("screen", {
      orientation: { lock: vi.fn().mockRejectedValue(new Error("nope")) },
    });
    await expect(toggleFullscreen(fakeDoc().doc)).resolves.toBeUndefined();
  });
});
