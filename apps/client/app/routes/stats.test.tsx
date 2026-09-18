import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Stats, { clientLoader } from "./stats.js";

const getSessionMock = vi.fn().mockResolvedValue({ access_token: "test-access-token" });
const getMyStatsMock = vi.fn();
const getMyMatchHistoryMock = vi.fn();

vi.mock("../auth/supabase.js", () => ({
  getSession: () => getSessionMock(),
  getMyStats: () => getMyStatsMock(),
  getMyMatchHistory: (limit: number) => getMyMatchHistoryMock(limit),
}));

const ZERO_STATS = { matchesPlayed: 0, wins: 0, eliminations: 0, deaths: 0, roundsWon: 0 };

function renderStats() {
  const router = createMemoryRouter(
    [
      { path: "/stats", Component: Stats, loader: clientLoader },
      { path: "/login", Component: () => <p>login route</p> },
    ],
    { initialEntries: ["/stats"] },
  );
  render(<RouterProvider router={router} />);
  return { router };
}

describe("Stats route", () => {
  afterEach(() => {
    cleanup();
    getSessionMock.mockReset().mockResolvedValue({ access_token: "test-access-token" });
    getMyStatsMock.mockReset().mockResolvedValue(ZERO_STATS);
    getMyMatchHistoryMock.mockReset().mockResolvedValue([]);
  });

  it("redirects to /login when clientLoader runs with no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const { router } = renderStats();

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("shows a placeholder when there is no match history", async () => {
    renderStats();

    expect(await screen.findByText("No matches played yet.")).toBeDefined();
  });

  it("renders the player's counters and match history rows", async () => {
    getMyStatsMock.mockResolvedValue({
      matchesPlayed: 10,
      wins: 4,
      eliminations: 12,
      deaths: 6,
      roundsWon: 9,
    });
    getMyMatchHistoryMock.mockResolvedValue([
      {
        matchId: "m1",
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:05:00Z",
        placement: 1,
        roundsWon: 2,
        eliminations: 3,
        deaths: 0,
        damageDealt: 150,
        weapon: "mace",
        won: true,
      },
    ]);
    renderStats();

    expect(await screen.findByText("4")).toBeDefined();
    expect(screen.getByText("Win")).toBeDefined();
    expect(screen.getByText("mace")).toBeDefined();
  });
});
