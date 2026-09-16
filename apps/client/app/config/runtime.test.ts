import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeConfig } from "./runtime.js";

describe("getRuntimeConfig", () => {
  afterEach(() => {
    delete window.__CONFIG__;
    vi.unstubAllEnvs();
  });

  it("returns window.__CONFIG__ when it is set", () => {
    window.__CONFIG__ = {
      GAME_SERVER_URL: "ws://example.test:2567",
      SUPABASE_URL: "https://example.test",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    };

    expect(getRuntimeConfig()).toEqual(window.__CONFIG__);
  });

  it("falls back to a local dev default when unset and running in dev mode", () => {
    expect(getRuntimeConfig().GAME_SERVER_URL).toBe("ws://localhost:2567");
  });

  it("uses VITE_GAME_SERVER_URL to override the dev default when set", () => {
    vi.stubEnv("VITE_GAME_SERVER_URL", "ws://192.168.1.50:2567");

    expect(getRuntimeConfig().GAME_SERVER_URL).toBe("ws://192.168.1.50:2567");
  });

  it("uses VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY to point dev at a local Supabase instance", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_local");

    const config = getRuntimeConfig();
    expect(config.SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(config.SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_local");
  });
});
