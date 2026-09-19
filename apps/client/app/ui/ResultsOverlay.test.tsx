import type { MatchResult } from "@castle-clash/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { GameClient } from "../game/GameClient.js";
import { ResultsOverlay } from "./ResultsOverlay.js";

const entry = { eliminations: 1, deaths: 0, damageDealt: 50, roundsWon: 3 };

function renderResults(result: MatchResult) {
  const client = {
    subscribeMatchResult: (listener: (next: MatchResult) => void) => {
      listener(result);
      return () => {};
    },
  } as unknown as GameClient;
  const router = createMemoryRouter([{ path: "/", element: <ResultsOverlay client={client} /> }]);
  render(<RouterProvider router={router} />);
}

describe("ResultsOverlay", () => {
  afterEach(cleanup);

  it("shows player names, not ids", () => {
    renderResults({
      winner: "sess-a" as MatchResult["winner"],
      rounds: 3,
      stats: { ["sess-a"]: entry, ["sess-b"]: entry } as MatchResult["stats"],
      names: { ["sess-a"]: "Sir_Kay", ["sess-b"]: "Guest-7F3A" } as MatchResult["names"],
    });

    expect(screen.getByRole("heading", { name: "Sir_Kay wins!" })).toBeDefined();
    expect(screen.getByRole("cell", { name: "Guest-7F3A" })).toBeDefined();
    expect(screen.queryByText("sess-b")).toBeNull();
  });

  it("falls back to a generic label when the server sent no names", () => {
    renderResults({
      winner: "sess-a" as MatchResult["winner"],
      rounds: 3,
      stats: { ["sess-a"]: entry } as MatchResult["stats"],
    });

    expect(screen.getByRole("heading", { name: "Player 1 wins!" })).toBeDefined();
    expect(screen.queryByText("sess-a")).toBeNull();
  });
});
