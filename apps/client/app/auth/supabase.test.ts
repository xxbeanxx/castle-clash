import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const linkIdentity = vi.fn();
const signInWithOAuth = vi.fn();
const signInWithOtp = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getSession, linkIdentity, signInWithOAuth, signInWithOtp } }),
}));
vi.mock("../config/runtime.js", () => ({
  getRuntimeConfig: () => ({
    SUPABASE_URL: "http://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "pk",
    GAME_SERVER_URL: "ws://game.test",
  }),
}));

const { signInToExistingGoogleAccount, signInWithGoogle, signInWithMagicLink } =
  await import("./supabase.js");
const { peekNext } = await import("./pendingNext.js");

const CALLBACK = `${window.location.origin}/auth/callback`;

function sessionFor(isAnonymous: boolean) {
  return { data: { session: { user: { id: "u1", is_anonymous: isAnonymous } } } };
}

describe("signInWithGoogle", () => {
  beforeEach(() => {
    linkIdentity.mockResolvedValue({ error: null });
    signInWithOAuth.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("links Google to a guest's own account, so their progress keeps the same user id", async () => {
    getSession.mockResolvedValue(sessionFor(true));

    await signInWithGoogle();

    expect(linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: CALLBACK },
    });
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("signs in normally when nobody is signed in", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await signInWithGoogle();

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: CALLBACK },
    });
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("signs in normally when the current account is already permanent", async () => {
    getSession.mockResolvedValue(sessionFor(false));

    await signInWithGoogle();

    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("remembers where to go afterwards, but only if it stays on the site", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await signInWithGoogle("/play/new?mode=private&code=ABC123");
    expect(peekNext()).toBe("/play/new?mode=private&code=ABC123");

    await signInWithGoogle("https://evil.example/x");
    expect(peekNext()).toBeNull();
  });

  it("never puts the destination in the redirect URL Supabase must allow-list", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await signInWithGoogle("/loadout");

    const options = signInWithOAuth.mock.calls[0]![0].options;
    expect(options.redirectTo).not.toContain("next");
    expect(options.redirectTo).not.toContain("?");
  });

  it("surfaces a linking failure to the caller", async () => {
    getSession.mockResolvedValue(sessionFor(true));
    linkIdentity.mockResolvedValue({ error: new Error("manual_linking_disabled") });

    await expect(signInWithGoogle()).rejects.toThrow("manual_linking_disabled");
  });
});

describe("signInToExistingGoogleAccount", () => {
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("signs in rather than links, even for a guest: that is the point of choosing it", async () => {
    getSession.mockResolvedValue(sessionFor(true));
    signInWithOAuth.mockResolvedValue({ error: null });

    await signInToExistingGoogleAccount("/lobby");

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: CALLBACK },
    });
    expect(linkIdentity).not.toHaveBeenCalled();
    expect(peekNext()).toBe("/lobby");
  });
});

describe("signInWithMagicLink", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends the emailed link to /auth/callback, so a new account is invited to pick a name", async () => {
    signInWithOtp.mockResolvedValue({ error: null });

    await signInWithMagicLink("player@example.test");

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "player@example.test",
      options: { emailRedirectTo: CALLBACK },
    });
  });

  it("surfaces a failure to send", async () => {
    signInWithOtp.mockResolvedValue({ error: new Error("rate limited") });

    await expect(signInWithMagicLink("player@example.test")).rejects.toThrow("rate limited");
  });
});
