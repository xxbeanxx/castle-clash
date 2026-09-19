import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle, select: () => ({ maybeSingle }) }));
const update = vi.fn(() => ({ eq }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select, update }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getSession }, from }),
}));
vi.mock("../config/runtime.js", () => ({
  getRuntimeConfig: () => ({
    SUPABASE_URL: "http://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "pk",
    GAME_SERVER_URL: "ws://game.test",
  }),
}));

const { getMyProfile, setMyDisplayName } = await import("./supabase.js");

function signedIn(isAnonymous: boolean) {
  getSession.mockResolvedValue({
    data: { session: { user: { id: "u1", is_anonymous: isAnonymous } } },
  });
}

describe("getMyProfile", () => {
  afterEach(() => vi.clearAllMocks());

  it("reads the chosen name and whether the account is a guest", async () => {
    signedIn(false);
    maybeSingle.mockResolvedValue({ data: { display_name: "Sir_Kay" }, error: null });

    await expect(getMyProfile()).resolves.toEqual({ displayName: "Sir_Kay", isAnonymous: false });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  it("reports no name as null", async () => {
    signedIn(true);
    maybeSingle.mockResolvedValue({ data: { display_name: null }, error: null });

    await expect(getMyProfile()).resolves.toEqual({ displayName: null, isAnonymous: true });
  });

  it("surfaces a read failure", async () => {
    signedIn(false);
    maybeSingle.mockResolvedValue({ data: null, error: new Error("offline") });

    await expect(getMyProfile()).rejects.toThrow("offline");
  });
});

describe("setMyDisplayName", () => {
  beforeEach(() => {
    signedIn(false);
  });
  afterEach(() => vi.clearAllMocks());

  it("saves a valid name, trimmed, on the caller's own row", async () => {
    maybeSingle.mockResolvedValue({ data: { display_name: "Sir_Kay" }, error: null });

    await expect(setMyDisplayName("  Sir_Kay ")).resolves.toEqual({ ok: true, name: "Sir_Kay" });
    expect(update).toHaveBeenCalledWith({ display_name: "Sir_Kay" });
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  it("tells the header a name changed", async () => {
    maybeSingle.mockResolvedValue({ data: { display_name: "Sir_Kay" }, error: null });
    const heard = vi.fn();
    window.addEventListener("cc:profile-changed", heard);

    await setMyDisplayName("Sir_Kay");

    window.removeEventListener("cc:profile-changed", heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("rejects a bad name without touching the database", async () => {
    await expect(setMyDisplayName("no")).resolves.toEqual({ ok: false, reason: "too_short" });
    await expect(setMyDisplayName("Guest-7F3A")).resolves.toEqual({
      ok: false,
      reason: "reserved",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a name someone else has as taken, however it is capitalised", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    await expect(setMyDisplayName("Sir_Kay")).resolves.toEqual({ ok: false, reason: "taken" });
  });

  it("reports a guest's refused save as such, not as a crash", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });

    await expect(setMyDisplayName("Sneaky")).resolves.toEqual({ ok: false, reason: "guest" });
  });

  it("treats an update that matched no row as a refusal too", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(setMyDisplayName("Sir_Kay")).resolves.toEqual({ ok: false, reason: "guest" });
  });

  it("lets an unexpected database error propagate", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });

    await expect(setMyDisplayName("Sir_Kay")).rejects.toMatchObject({ message: "boom" });
  });
});
