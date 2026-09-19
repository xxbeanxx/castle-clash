import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerStatsCache } from "../api/serverStats.js";
import Home from "./home.js";

const getSessionMock = vi.fn();
const signInAsGuestMock = vi.fn();
const getLeaderboardMock = vi.fn();

vi.mock("../auth/supabase.js", () => ({
  getSession: () => getSessionMock(),
  signInAsGuest: () => signInAsGuestMock(),
  getLeaderboard: (offset: number, limit: number) => getLeaderboardMock(offset, limit),
}));

vi.mock("../config/runtime.js", () => ({
  getRuntimeConfig: () => ({
    GAME_SERVER_URL: "ws://game.test",
    SUPABASE_URL: "",
    SUPABASE_PUBLISHABLE_KEY: "",
  }),
}));

function renderHome() {
  const router = createMemoryRouter(
    [
      { path: "/", Component: Home },
      { path: "/play/:roomId", Component: () => <p>play route</p> },
      { path: "/login", Component: () => <p>login route</p> },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function stubStats(result: "fail" | { players: number; rooms: number; version: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      result === "fail"
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(new Response(JSON.stringify(result))),
    ),
  );
}

beforeEach(() => {
  resetServerStatsCache();
  getSessionMock.mockResolvedValue(null);
  signInAsGuestMock.mockResolvedValue(undefined);
  getLeaderboardMock.mockRejectedValue(new Error("offline"));
  stubStats("fail");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Home (landing)", () => {
  it("renders the whole page, with no error state, when /stats and the leaderboard both fail", async () => {
    renderHome();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/last knight standing/i);
    expect(screen.getAllByRole("button", { name: "Play now" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    // Let the failed fetches settle, then confirm nothing alarming appeared.
    await waitFor(() => expect(getLeaderboardMock).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/in the arena now/)).toBeNull();
    expect(screen.queryByText("Hall of champions")).toBeNull();
  });

  it("shows how it works, controls, every arena and every weapon from shared data", () => {
    renderHome();
    expect(screen.getByRole("heading", { name: "How a match plays" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Controls" })).toBeTruthy();
    expect(screen.getAllByRole("img", { name: /arena layout$/ })).toHaveLength(6); // the hero copy of an arena is decorative (aria-hidden)
    for (const weapon of ["Sword", "Mace", "Spear"]) {
      expect(screen.getByRole("heading", { name: weapon })).toBeTruthy();
    }
  });

  it("shows the live player count when /stats answers", async () => {
    stubStats({ players: 12, rooms: 3, version: "1.1.0" });
    renderHome();
    expect(await screen.findByText(/12 knights in the arena now/)).toBeTruthy();
  });

  it("uses the singular for one player, and hides the line for zero", async () => {
    stubStats({ players: 1, rooms: 1, version: "1.1.0" });
    renderHome();
    expect(await screen.findByText(/1 knight in the arena now/)).toBeTruthy();
    cleanup();

    resetServerStatsCache();
    stubStats({ players: 0, rooms: 0, version: "1.1.0" });
    renderHome();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/in the arena now/)).toBeNull();
  });

  it("lists only named players in the leaderboard teaser", async () => {
    getLeaderboardMock.mockResolvedValue([
      { display_name: null, wins: 9 },
      { display_name: "Ser Bean", wins: 7 },
      { display_name: null, wins: 5 },
      { display_name: "Dame Kip", wins: 3 },
    ]);
    renderHome();
    expect(await screen.findByText("Ser Bean")).toBeTruthy();
    expect(screen.getByText("Dame Kip")).toBeTruthy();
    expect(screen.queryByText("Anonymous")).toBeNull();
  });

  it("hides the teaser when nobody has a name yet", async () => {
    getLeaderboardMock.mockResolvedValue([{ display_name: null, wins: 9 }]);
    renderHome();
    await waitFor(() => expect(getLeaderboardMock).toHaveBeenCalled());
    expect(screen.queryByText("Hall of champions")).toBeNull();
  });
});

describe("Play now", () => {
  it("signs in as a guest, then goes to quick play, in one click", async () => {
    const router = renderHome();
    fireEvent.click(screen.getAllByRole("button", { name: "Play now" })[0] as HTMLElement);

    await waitFor(() => expect(router.state.location.pathname).toBe("/play/new"));
    expect(signInAsGuestMock).toHaveBeenCalledTimes(1);
  });

  it("skips guest sign-in when there is already a session", async () => {
    getSessionMock.mockResolvedValue({ access_token: "t" });
    const router = renderHome();
    fireEvent.click(screen.getAllByRole("button", { name: "Play now" })[0] as HTMLElement);

    await waitFor(() => expect(router.state.location.pathname).toBe("/play/new"));
    expect(signInAsGuestMock).not.toHaveBeenCalled();
  });

  it("stays put with a message and a way to sign in when guest sign-in fails", async () => {
    signInAsGuestMock.mockRejectedValue(new Error("Anonymous sign-ins are disabled"));
    const router = renderHome();
    fireEvent.click(screen.getAllByRole("button", { name: "Play now" })[0] as HTMLElement);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Anonymous sign-ins are disabled");
    expect(router.state.location.pathname).toBe("/");
    expect(screen.getAllByRole("button", { name: "Play now" })[0]).toHaveProperty(
      "disabled",
      false,
    );
  });
});
