import type { MatchResult } from "@castle-clash/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameClient } from "../game/GameClient.js";
import type { RoomInfoSnapshot } from "../game/roomInfo.js";
import { ResultsOverlay } from "./ResultsOverlay.js";

// The nudge has its own tests; here the player is signed out, so it stays silent.
vi.mock("../auth/supabase.js", () => ({
  getSession: async () => null,
  signInWithGoogle: vi.fn(),
}));

const entry = { eliminations: 1, deaths: 0, damageDealt: 50, roundsWon: 3 };

const SOLO_INFO: RoomInfoSnapshot = {
  mode: "practice",
  backfillOfferable: false,
  wantsRematch: false,
  humans: 1,
  botIds: [],
};

class FakeClient {
  rematches = 0;
  readonly #results = new Set<(result: MatchResult | null) => void>();
  readonly #info = new Set<(info: RoomInfoSnapshot) => void>();
  readonly #unlocks = new Set<(ids: readonly string[]) => void>();

  subscribeMatchResult(listener: (result: MatchResult | null) => void): () => void {
    this.#results.add(listener);
    return () => this.#results.delete(listener);
  }
  subscribeRoomInfo(listener: (info: RoomInfoSnapshot) => void): () => void {
    this.#info.add(listener);
    return () => this.#info.delete(listener);
  }
  subscribeProfileUnlocks(listener: (ids: readonly string[]) => void): () => void {
    this.#unlocks.add(listener);
    return () => this.#unlocks.delete(listener);
  }
  requestRematch(): void {
    this.rematches += 1;
  }
  emitResult(result: MatchResult | null): void {
    act(() => this.#results.forEach((listener) => listener(result)));
  }
  emitInfo(info: RoomInfoSnapshot): void {
    act(() => this.#info.forEach((listener) => listener(info)));
  }
  emitUnlocks(ids: readonly string[]): void {
    act(() => this.#unlocks.forEach((listener) => listener(ids)));
  }
}

function renderResults(result: MatchResult | null, info: RoomInfoSnapshot = SOLO_INFO) {
  const client = new FakeClient();
  const router = createMemoryRouter([
    { path: "/", element: <ResultsOverlay client={client as unknown as GameClient} /> },
    { path: "/lobby", element: <p>lobby route</p> },
  ]);
  render(<RouterProvider router={router} />);
  client.emitInfo(info);
  client.emitResult(result);
  return { client, router };
}

const RESULT: MatchResult = {
  winner: "sess-a" as MatchResult["winner"],
  rounds: 3,
  stats: { ["sess-a"]: entry, ["sess-b"]: entry } as MatchResult["stats"],
  names: { ["sess-a"]: "Sir_Kay", ["sess-b"]: "Guest-7F3A" } as MatchResult["names"],
};

describe("ResultsOverlay", () => {
  afterEach(cleanup);

  it("shows player names, not ids", () => {
    renderResults(RESULT);

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

  it("names a bot as a bot, in the table and in the headline", () => {
    renderResults(
      { ...RESULT, winner: "sess-b" as MatchResult["winner"] },
      { ...SOLO_INFO, botIds: ["sess-b"] },
    );

    expect(screen.getByRole("heading", { name: "Guest-7F3A (bot) wins!" })).toBeDefined();
    expect(screen.getByRole("cell", { name: "Guest-7F3A (bot)" })).toBeDefined();
    expect(screen.getByRole("cell", { name: "Sir_Kay" })).toBeDefined();
  });

  it("offers Play again and Back to lobby", () => {
    const { client, router } = renderResults(RESULT);

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(client.rematches).toBe(1);

    fireEvent.click(screen.getByRole("link", { name: "Back to lobby" }));
    expect(router.state.location.pathname).toBe("/lobby");
  });

  it("after asking for a rematch, says so and cannot ask twice (alone, then with others)", () => {
    const { client } = renderResults(RESULT, { ...SOLO_INFO, wantsRematch: true });
    const button = screen.getByRole("button", { name: "Starting…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    client.emitInfo({ ...SOLO_INFO, humans: 2, wantsRematch: true });
    expect(screen.getByRole("button", { name: "Waiting for the others…" })).toBeDefined();
  });

  it("lists what the match unlocked, by name", () => {
    const { client } = renderResults(RESULT);
    expect(screen.queryByTestId("results-unlocks")).toBeNull();

    client.emitUnlocks(["not-in-the-catalog"]);
    expect(screen.getByTestId("results-unlocks").textContent).toBe("Unlocked: not-in-the-catalog");
  });

  it("goes away when the room starts a new match", () => {
    const { client } = renderResults(RESULT);
    expect(screen.getByTestId("results-overlay")).toBeDefined();

    client.emitResult(null);
    expect(screen.queryByTestId("results-overlay")).toBeNull();
  });
});
