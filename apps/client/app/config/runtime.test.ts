import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeConfig } from "./runtime.js";

describe("getRuntimeConfig", () => {
  afterEach(() => {
    delete window.__CONFIG__;
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
});
