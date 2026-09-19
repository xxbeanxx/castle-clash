import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Account, { clientLoader } from "./account.js";

const getSessionMock = vi.fn();
const getMyProfileMock = vi.fn();
const setMyDisplayNameMock = vi.fn();
const signInWithGoogleMock = vi.fn().mockResolvedValue(undefined);
const signOutMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/supabase.js", () => ({
  getSession: () => getSessionMock(),
  getMyProfile: () => getMyProfileMock(),
  setMyDisplayName: (name: string) => setMyDisplayNameMock(name),
  signInWithGoogle: (next?: string) => signInWithGoogleMock(next),
  signOut: () => signOutMock(),
}));

const MEMBER = { displayName: "Sir_Kay", isAnonymous: false };
const NEW_MEMBER = { displayName: null, isAnonymous: false };
const GUEST = { displayName: null, isAnonymous: true };

function renderAccount(entry = "/account") {
  const router = createMemoryRouter(
    [
      { path: "/account", Component: Account, loader: clientLoader },
      { path: "/login", Component: () => <p>login route</p> },
      { path: "/lobby", Component: () => <p>lobby route</p> },
      { path: "/loadout", Component: () => <p>loadout route</p> },
      { path: "/", Component: () => <p>home route</p> },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return { router };
}

describe("Account route", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getMyProfileMock.mockResolvedValue(MEMBER);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sends a signed-out visitor to /login", async () => {
    getSessionMock.mockResolvedValue(null);
    const { router } = renderAccount();

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  describe("for a signed-in player", () => {
    it("shows the current name, ready to edit", async () => {
      renderAccount();

      const field = (await screen.findByLabelText("Display name")) as HTMLInputElement;
      expect(field.value).toBe("Sir_Kay");
    });

    it("saves a new name and says so", async () => {
      setMyDisplayNameMock.mockResolvedValue({ ok: true, name: "Sir_Bors" });
      renderAccount();

      fireEvent.change(await screen.findByLabelText("Display name"), {
        target: { value: "Sir_Bors" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save name/i }));

      await screen.findByText(/saved/i);
      expect(setMyDisplayNameMock).toHaveBeenCalledWith("Sir_Bors");
    });

    it.each([
      ["taken", /already taken/i],
      ["too_short", /at least 3/i],
      ["too_long", /at most 16/i],
      ["bad_characters", /letters, numbers/i],
      ["reserved", /can.t use that name/i],
      ["blocked", /can.t use that name/i],
    ] as const)("explains a %s name in plain words", async (reason, message) => {
      setMyDisplayNameMock.mockResolvedValue({ ok: false, reason });
      renderAccount();

      fireEvent.change(await screen.findByLabelText("Display name"), {
        target: { value: "whatever" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save name/i }));

      expect((await screen.findByRole("alert")).textContent).toMatch(message);
    });

    it("offers to sign out, and goes home afterwards", async () => {
      const { router } = renderAccount();

      fireEvent.click(await screen.findByRole("button", { name: /sign out/i }));

      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("right after a first sign-in (welcome)", () => {
    beforeEach(() => {
      getMyProfileMock.mockResolvedValue(NEW_MEMBER);
    });

    const entry = `/account?welcome=1&next=${encodeURIComponent("/loadout")}`;

    it("invites a name without blocking play", async () => {
      const { router } = renderAccount(entry);

      await screen.findByText(/pick a name/i);
      fireEvent.click(screen.getByRole("link", { name: /skip for now/i }));

      await waitFor(() => expect(router.state.location.pathname).toBe("/loadout"));
    });

    it("carries on to where the player was headed once a name is saved", async () => {
      setMyDisplayNameMock.mockResolvedValue({ ok: true, name: "Sir_Kay" });
      const { router } = renderAccount(entry);

      fireEvent.change(await screen.findByLabelText("Display name"), {
        target: { value: "Sir_Kay" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save name/i }));

      await waitFor(() => expect(router.state.location.pathname).toBe("/loadout"));
    });

    it("ignores a next that leaves the site, and falls back to the lobby", async () => {
      const { router } = renderAccount(
        `/account?welcome=1&next=${encodeURIComponent("https://evil.example/x")}`,
      );

      fireEvent.click(await screen.findByRole("link", { name: /skip for now/i }));

      await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
    });
  });

  describe("for a guest", () => {
    beforeEach(() => {
      getMyProfileMock.mockResolvedValue(GUEST);
    });

    it("offers to save progress instead of a name form, since guests cannot have a name", async () => {
      renderAccount();

      await screen.findByRole("heading", { name: /playing as a guest/i });
      expect(screen.queryByLabelText("Display name")).toBeNull();
      expect(screen.getByText(/keep your stats and unlocks/i)).toBeDefined();
    });

    it("links Google, returning to the account page afterwards", async () => {
      renderAccount();

      fireEvent.click(await screen.findByRole("button", { name: /continue with google/i }));

      await waitFor(() => expect(signInWithGoogleMock).toHaveBeenCalledWith("/account"));
    });

    it("shows why if starting Google failed", async () => {
      signInWithGoogleMock.mockRejectedValueOnce(new Error("Manual linking is disabled"));
      renderAccount();

      fireEvent.click(await screen.findByRole("button", { name: /continue with google/i }));

      expect((await screen.findByRole("alert")).textContent).toMatch(/manual linking is disabled/i);
    });
  });
});
