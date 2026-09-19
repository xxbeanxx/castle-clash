import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GameClient } from "../game/GameClient.js";
import { UnlockToast } from "./UnlockToast.js";

/** A minimal stand-in for `GameClient`, same pattern as `DraftOverlay.
 *  test.tsx`'s `FakeGameClient` — this component only reads
 *  `subscribeProfileUnlocks`. */
class FakeGameClient {
  #listeners = new Set<(itemIds: readonly string[]) => void>();

  subscribeProfileUnlocks(listener: (itemIds: readonly string[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(itemIds: readonly string[]): void {
    act(() => {
      for (const listener of this.#listeners) {
        listener(itemIds);
      }
    });
  }
}

describe("UnlockToast", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing until an unlock arrives", () => {
    const client = new FakeGameClient();
    render(<UnlockToast client={client as unknown as GameClient} />);

    expect(screen.queryByTestId("unlock-toast")).toBeNull();
  });

  it("shows the unlocked item's catalog name once a profile:unlocks message arrives", async () => {
    const client = new FakeGameClient();
    render(<UnlockToast client={client as unknown as GameClient} />);

    client.emit(["cape-tattered"]);

    await waitFor(() => expect(screen.getByText("Tattered Cape")).toBeDefined());
  });

  it("falls back to the raw item id for an unrecognized catalog id", async () => {
    const client = new FakeGameClient();
    render(<UnlockToast client={client as unknown as GameClient} />);

    client.emit(["not-a-real-item"]);

    await waitFor(() => expect(screen.getByText("not-a-real-item")).toBeDefined());
  });

  it("lists every newly-unlocked item from a single message", async () => {
    const client = new FakeGameClient();
    render(<UnlockToast client={client as unknown as GameClient} />);

    client.emit(["cape-tattered", "helmet-bronze"]);

    await waitFor(() => expect(screen.getByText("Tattered Cape")).toBeDefined());
    expect(screen.getByText("Bronze Helm")).toBeDefined();
    expect(screen.getByText("New unlocks!")).toBeDefined();
  });
});
