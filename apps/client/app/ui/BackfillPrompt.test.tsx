import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameClient } from "../game/GameClient.js";
import type { RoomInfoSnapshot } from "../game/roomInfo.js";
import { BackfillPrompt, BotDroppedNotice } from "./BackfillPrompt.js";

class FakeClient {
  readonly requested: string[] = [];
  readonly #info = new Set<(info: RoomInfoSnapshot) => void>();
  readonly #dropped = new Set<(name: string) => void>();

  subscribeRoomInfo(listener: (info: RoomInfoSnapshot) => void): () => void {
    this.#info.add(listener);
    return () => this.#info.delete(listener);
  }
  subscribeBotDropped(listener: (name: string) => void): () => void {
    this.#dropped.add(listener);
    return () => this.#dropped.delete(listener);
  }
  requestBackfillBot(tier: string): void {
    this.requested.push(tier);
  }
  emitInfo(overrides: Partial<RoomInfoSnapshot> = {}): void {
    act(() => {
      for (const listener of this.#info) {
        listener({
          mode: "quick",
          backfillOfferable: false,
          wantsRematch: false,
          humans: 1,
          botIds: [],
          ...overrides,
        });
      }
    });
  }
  emitDropped(name: string): void {
    act(() => {
      for (const listener of this.#dropped) {
        listener(name);
      }
    });
  }
}

const asClient = (client: FakeClient) => client as unknown as GameClient;

describe("BackfillPrompt (decision D4)", () => {
  afterEach(cleanup);

  it("says nothing until the server offers a bot", () => {
    const client = new FakeClient();
    render(<BackfillPrompt client={asClient(client)} />);
    client.emitInfo({ backfillOfferable: false });
    expect(screen.queryByTestId("backfill-prompt")).toBeNull();
  });

  it("never offers in a private or practice room, whatever the flag says", () => {
    const client = new FakeClient();
    render(<BackfillPrompt client={asClient(client)} />);
    client.emitInfo({ mode: "private", backfillOfferable: true });
    expect(screen.queryByTestId("backfill-prompt")).toBeNull();
    client.emitInfo({ mode: "practice", backfillOfferable: true });
    expect(screen.queryByTestId("backfill-prompt")).toBeNull();
  });

  it("offers three difficulties and asks for exactly the one clicked, once", () => {
    const client = new FakeClient();
    render(<BackfillPrompt client={asClient(client)} />);
    client.emitInfo({ backfillOfferable: true });

    expect(screen.getByRole("button", { name: "Easy bot" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Normal bot" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Hard bot" }));
    fireEvent.click(screen.getByRole("button", { name: "Easy bot" }));

    expect(client.requested).toEqual(["hard"]);
  });

  it("goes away once the server stops offering (a bot was seated)", () => {
    const client = new FakeClient();
    render(<BackfillPrompt client={asClient(client)} />);
    client.emitInfo({ backfillOfferable: true });
    client.emitInfo({ backfillOfferable: false, botIds: ["bot-0"] });
    expect(screen.queryByTestId("backfill-prompt")).toBeNull();
  });
});

describe("BotDroppedNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("names the bot that stepped aside, then clears itself", () => {
    const client = new FakeClient();
    render(<BotDroppedNotice client={asClient(client)} />);
    expect(screen.queryByTestId("bot-dropped-notice")).toBeNull();

    client.emitDropped("Sir Aldric");
    expect(screen.getByRole("status").textContent).toBe(
      "A player joined, so Sir Aldric stepped aside.",
    );

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByTestId("bot-dropped-notice")).toBeNull();
  });
});
