import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabasePlayerRepository } from "./createPlayerRepository.js";

describe("createSupabasePlayerRepository", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns nothing when Supabase is not configured, rather than an in-memory stand-in", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(createSupabasePlayerRepository()).toBeUndefined();
  });

  it("returns nothing when only one of the two variables is set", () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(createSupabasePlayerRepository()).toBeUndefined();
  });

  it("returns the real repository when both are set", () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    expect(createSupabasePlayerRepository()).toBeDefined();
  });
});
