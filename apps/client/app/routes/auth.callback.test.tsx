import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { peekNext, rememberNext } from "../auth/pendingNext.js";
import AuthCallback from "./auth.callback.js";

const getSessionMock = vi.fn();
const getMyStatsMock = vi.fn();
const signInToExistingMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/supabase.js", () => ({
  getSession: () => getSessionMock(),
  getMyStats: () => getMyStatsMock(),
  signInToExistingGoogleAccount: (next?: string) => signInToExistingMock(next),
}));

const GUEST = { user: { id: "guest-1", is_anonymous: true } };
const MEMBER = { user: { id: "member-1", is_anonymous: false } };
const STATS = { matchesPlayed: 4, wins: 2, eliminations: 9, deaths: 5, roundsWon: 6 };

const COLLISION =
  "?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user";

function renderCallback(entry: string, options: { strict?: boolean } = {}) {
  const router = createMemoryRouter(
    [
      { path: "/auth/callback", Component: AuthCallback },
      { path: "/lobby", Component: () => <p>lobby route</p> },
      { path: "/login", Component: () => <p>login route</p> },
      { path: "/play/:roomId", Component: () => <p>play route</p> },
    ],
    { initialEntries: [entry] },
  );
  const tree = <RouterProvider router={router} />;
  render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { router };
}

describe("/auth/callback", () => {
  beforeEach(() => {
    getMyStatsMock.mockResolvedValue(STATS);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe("when sign-in worked", () => {
    it("goes to the lobby by default", async () => {
      getSessionMock.mockResolvedValue(MEMBER);
      const { router } = renderCallback("/auth/callback");

      await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
    });

    it("goes to the page the player was headed for before Google", async () => {
      getSessionMock.mockResolvedValue(MEMBER);
      rememberNext("/play/new?mode=private&code=ABC123");
      const { router } = renderCallback("/auth/callback");

      await waitFor(() =>
        expect(router.state.location.pathname + router.state.location.search).toBe(
          "/play/new?mode=private&code=ABC123",
        ),
      );
      expect(peekNext()).toBeNull();
    });

    it("still finds the destination when React StrictMode runs the effect twice", async () => {
      getSessionMock.mockResolvedValue(MEMBER);
      rememberNext("/play/new?mode=private&code=ABC123");
      const { router } = renderCallback("/auth/callback", { strict: true });

      await waitFor(() => expect(router.state.location.pathname).toBe("/play/new"));
    });

    it("says so, and offers another try, if no session came back", async () => {
      getSessionMock.mockResolvedValue(null);
      renderCallback("/auth/callback");

      await screen.findByText(/didn.t finish/i);
      expect(screen.getByRole("link", { name: /try again/i }).getAttribute("href")).toBe("/login");
    });
  });

  describe("when the Google account already belongs to someone else", () => {
    it("explains it to a guest and offers to keep playing as one", async () => {
      getSessionMock.mockResolvedValue(GUEST);
      const { router } = renderCallback(`/auth/callback${COLLISION}`);

      await screen.findByRole("heading", { name: /you already have an account/i });
      expect(screen.getByText(/couldn.t attach your guest progress/i)).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: /keep playing as guest/i }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
      expect(signInToExistingMock).not.toHaveBeenCalled();
    });

    it("never signs in to the other account without an explicit confirmation", async () => {
      getSessionMock.mockResolvedValue(GUEST);
      renderCallback(`/auth/callback${COLLISION}`);

      fireEvent.click(await screen.findByRole("button", { name: /sign in to that account/i }));

      const dialog = await screen.findByRole("dialog", { name: /discard this guest/i });
      expect(signInToExistingMock).not.toHaveBeenCalled();
      // The warning is specific about what is lost, including how much.
      expect(within(dialog).getByText(/4 matches/i)).toBeDefined();
      expect(within(dialog).getByText(/can.t be brought over or recovered/i)).toBeDefined();
    });

    it("cancelling the confirmation changes nothing", async () => {
      getSessionMock.mockResolvedValue(GUEST);
      renderCallback(`/auth/callback${COLLISION}`);

      fireEvent.click(await screen.findByRole("button", { name: /sign in to that account/i }));
      fireEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(signInToExistingMock).not.toHaveBeenCalled();
    });

    it("signs in to the existing account once confirmed, keeping the destination", async () => {
      getSessionMock.mockResolvedValue(GUEST);
      rememberNext("/loadout");
      renderCallback(`/auth/callback${COLLISION}`);

      fireEvent.click(await screen.findByRole("button", { name: /sign in to that account/i }));
      fireEvent.click(await screen.findByRole("button", { name: /discard guest progress/i }));

      await waitFor(() => expect(signInToExistingMock).toHaveBeenCalledWith("/loadout"));
    });

    it("still warns when the guest's progress can't be counted", async () => {
      getSessionMock.mockResolvedValue(GUEST);
      getMyStatsMock.mockRejectedValue(new Error("offline"));
      renderCallback(`/auth/callback${COLLISION}`);

      fireEvent.click(await screen.findByRole("button", { name: /sign in to that account/i }));

      const dialog = await screen.findByRole("dialog", { name: /discard this guest/i });
      expect(within(dialog).getByText(/can.t be brought over or recovered/i)).toBeDefined();
    });

    it("words the email case for what it is: the address already has an account", async () => {
      getSessionMock.mockResolvedValue(GUEST);
      renderCallback("/auth/callback?error=invalid_request&error_code=email_exists");

      await screen.findByText(/email address already has an account/i);
      expect(screen.getByRole("button", { name: /sign in to that account/i })).toBeDefined();
    });

    it("needs no discard warning when there is no guest to discard", async () => {
      getSessionMock.mockResolvedValue(null);
      renderCallback(`/auth/callback${COLLISION}`);

      fireEvent.click(await screen.findByRole("button", { name: /sign in with google/i }));

      await waitFor(() => expect(signInToExistingMock).toHaveBeenCalled());
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("when something else went wrong", () => {
    it("treats backing out of Google as a non-event", async () => {
      getSessionMock.mockResolvedValue(GUEST);
      renderCallback("/auth/callback?error=access_denied&error_description=User+denied+access");

      await screen.findByText(/cancelled/i);
      expect(screen.getByRole("link", { name: /back to the game/i })).toBeDefined();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows Supabase's own words for an unexpected error", async () => {
      getSessionMock.mockResolvedValue(GUEST);
      renderCallback("/auth/callback?error=server_error&error_description=Database+is+asleep");

      await screen.findByText(/Database is asleep/);
      expect(screen.getByRole("link", { name: /try again/i })).toBeDefined();
    });
  });
});
