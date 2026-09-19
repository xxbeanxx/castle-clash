import { afterEach, describe, expect, it, vi } from "vitest";
import { serverVersion } from "./serverVersion.js";

describe("serverVersion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the SERVER_VERSION the image was built with", () => {
    vi.stubEnv("SERVER_VERSION", "1.4.2");
    expect(serverVersion()).toBe("1.4.2");
  });

  it("falls back to a dev marker when unset, never an empty string", () => {
    vi.stubEnv("SERVER_VERSION", undefined);
    expect(serverVersion()).toBe("0.0.0-dev");
  });

  it("treats an empty SERVER_VERSION (an unset build-arg) as unset", () => {
    vi.stubEnv("SERVER_VERSION", "");
    expect(serverVersion()).toBe("0.0.0-dev");
  });
});
