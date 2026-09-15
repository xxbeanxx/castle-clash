import { afterEach, describe, expect, it, vi } from "vitest";

describe("installE2eDebugHook", () => {
  afterEach(() => {
    delete window.__CC_DEBUG__;
    vi.unstubAllEnvs();
  });

  it("does not install the hook when VITE_E2E is unset", async () => {
    const { installE2eDebugHook } = await import("./debug.js");
    installE2eDebugHook({ localPosition: null } as never);

    expect(window.__CC_DEBUG__).toBeUndefined();
  });

  it("installs a hook that reads the client's localPosition when VITE_E2E=1", async () => {
    vi.stubEnv("VITE_E2E", "1");
    const { installE2eDebugHook } = await import("./debug.js");
    const client = { localPosition: { x: 42, y: 7 } };

    installE2eDebugHook(client as never);

    expect(window.__CC_DEBUG__?.localPosition()).toEqual({ x: 42, y: 7 });
  });
});
