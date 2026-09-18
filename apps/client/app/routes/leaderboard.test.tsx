import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Leaderboard, { clientLoader } from "./leaderboard.js";

const getSessionMock = vi.fn().mockResolvedValue({ access_token: "test-access-token" });
const getLeaderboardMock = vi.fn();

vi.mock("../auth/supabase.js", () => ({
  getSession: () => getSessionMock(),
  getLeaderboard: (offset: number, limit: number) => getLeaderboardMock(offset, limit),
}));

function makeRow(name: string, wins: number) {
  return {
    display_name: name,
    wins,
    matches_played: wins + 1,
    eliminations: wins * 2,
    deaths: 1,
    rounds_won: wins,
  };
}

function renderLeaderboard() {
  const router = createMemoryRouter(
    [
      { path: "/leaderboard", Component: Leaderboard, loader: clientLoader },
      { path: "/login", Component: () => <p>login route</p> },
    ],
    { initialEntries: ["/leaderboard"] },
  );
  render(<RouterProvider router={router} />);
  return { router };
}

describe("Leaderboard route", () => {
  afterEach(() => {
    cleanup();
    getSessionMock.mockReset().mockResolvedValue({ access_token: "test-access-token" });
    getLeaderboardMock.mockReset().mockResolvedValue([makeRow("alice", 10)]);
  });

  it("redirects to /login when clientLoader runs with no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const { router } = renderLeaderboard();

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("renders the first page of rows from the loader", async () => {
    renderLeaderboard();

    expect(await screen.findByText("alice")).toBeDefined();
    expect(getLeaderboardMock).toHaveBeenCalledWith(0, 20);
  });

  it("fetches the next page when Next is clicked", async () => {
    getLeaderboardMock.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => makeRow(`p${i}`, 20 - i)),
    );
    renderLeaderboard();
    await screen.findByText("p0");

    getLeaderboardMock.mockResolvedValueOnce([makeRow("bob", 5)]);
    fireEvent.click(screen.getByText("Next"));

    await waitFor(() => expect(getLeaderboardMock).toHaveBeenCalledWith(20, 20));
    expect(await screen.findByText("bob")).toBeDefined();
  });

  it("disables Previous on the first page", async () => {
    renderLeaderboard();
    await screen.findByText("alice");

    expect((screen.getByText("Previous") as HTMLButtonElement).disabled).toBe(true);
  });
});
