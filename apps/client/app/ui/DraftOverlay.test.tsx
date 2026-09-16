import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftOfferSnapshot, GameClient } from "../game/GameClient.js";
import type { HudPlayerSnapshot } from "../game/hud.js";
import type { MatchFlowSnapshot } from "../game/matchFlow.js";
import { DraftOverlay } from "./DraftOverlay.js";

/** A minimal stand-in for `GameClient` exposing only what `DraftOverlay`
 *  reads (`subscribeDraftOffer`/`subscribeMatchFlow`/`subscribeHud`/
 *  `pickPowerUp`) — the real class needs a Pixi `Application` and a live
 *  Colyseus room, neither of which this component-level test should need to
 *  boot. Each `emit*` helper synchronously calls every subscriber, mirroring
 *  `GameClient`'s own `Emitter`. */
class FakeGameClient {
  #offerListeners = new Set<(offer: DraftOfferSnapshot | null) => void>();
  #flowListeners = new Set<(flow: MatchFlowSnapshot) => void>();
  #hudListeners = new Set<(hud: HudPlayerSnapshot[]) => void>();
  readonly pickPowerUp = vi.fn();

  subscribeDraftOffer(listener: (offer: DraftOfferSnapshot | null) => void): () => void {
    this.#offerListeners.add(listener);
    return () => this.#offerListeners.delete(listener);
  }

  subscribeMatchFlow(listener: (flow: MatchFlowSnapshot) => void): () => void {
    this.#flowListeners.add(listener);
    return () => this.#flowListeners.delete(listener);
  }

  subscribeHud(listener: (hud: HudPlayerSnapshot[]) => void): () => void {
    this.#hudListeners.add(listener);
    return () => this.#hudListeners.delete(listener);
  }

  // Wrapped in `act()` — these fire outside any React event handler (a real
  // `Emitter.emit` from a Colyseus `onStateChange`/`onMessage` callback
  // would too), so React needs telling to flush the resulting state update
  // before the test's next assertion reads the DOM.
  emitOffer(offer: DraftOfferSnapshot | null): void {
    act(() => {
      for (const listener of this.#offerListeners) {
        listener(offer);
      }
    });
  }

  emitFlow(flow: MatchFlowSnapshot): void {
    act(() => {
      for (const listener of this.#flowListeners) {
        listener(flow);
      }
    });
  }

  emitHud(hud: HudPlayerSnapshot[]): void {
    act(() => {
      for (const listener of this.#hudListeners) {
        listener(hud);
      }
    });
  }
}

function draftFlow(overrides: Partial<MatchFlowSnapshot> = {}): MatchFlowSnapshot {
  return { phase: "Draft", round: 1, ticksRemaining: 600, ...overrides };
}

const OFFER: DraftOfferSnapshot = { offers: ["sharpEdge", "vampiricEdge", "aerialistBoots"], endsAtTick: 900, picked: null };

function opponent(overrides: Partial<HudPlayerSnapshot> = {}): HudPlayerSnapshot {
  return {
    id: "opponent-1",
    isLocal: false,
    hp: 100,
    stamina: 100,
    weapon: "sword",
    action: "Idle",
    powerups: [],
    ...overrides,
  };
}

describe("DraftOverlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing before an offer arrives", () => {
    const client = new FakeGameClient();
    render(<DraftOverlay client={client as unknown as GameClient} />);
    expect(screen.queryByTestId("draft-overlay")).toBeNull();
  });

  it("renders nothing once the phase moves past Draft, even with a stale offer", () => {
    const client = new FakeGameClient();
    render(<DraftOverlay client={client as unknown as GameClient} />);

    client.emitOffer(OFFER);
    client.emitFlow(draftFlow({ phase: "Countdown", ticksRemaining: null }));

    expect(screen.queryByTestId("draft-overlay")).toBeNull();
  });

  it("renders the three offered cards and a countdown", () => {
    const client = new FakeGameClient();
    render(<DraftOverlay client={client as unknown as GameClient} />);

    client.emitOffer(OFFER);
    client.emitFlow(draftFlow());

    const cards = screen.getAllByTestId("draft-card");
    expect(cards).toHaveLength(3);
    expect(screen.getByText("sharpEdge")).toBeDefined();
    expect(screen.getByText("vampiricEdge")).toBeDefined();
    expect(screen.getByText("aerialistBoots")).toBeDefined();
    expect(screen.getByText(/10s/)).toBeDefined(); // 600 ticks / 60Hz = 10s
  });

  it("clicking a card sends the pick and disables the others", () => {
    const client = new FakeGameClient();
    render(<DraftOverlay client={client as unknown as GameClient} />);

    client.emitOffer(OFFER);
    client.emitFlow(draftFlow());

    fireEvent.click(screen.getByText("sharpEdge"));
    expect(client.pickPowerUp).toHaveBeenCalledWith("sharpEdge");

    // GameClient echoes the local pick back through subscribeDraftOffer
    // before any server ack — simulate that here, the same way it really
    // happens.
    client.emitOffer({ ...OFFER, picked: "sharpEdge" });

    const cards = screen.getAllByTestId("draft-card");
    expect(cards.every((card) => (card as HTMLButtonElement).disabled)).toBe(true);
  });

  it("disables the UI after picking, before the timeout fires", () => {
    const client = new FakeGameClient();
    render(<DraftOverlay client={client as unknown as GameClient} />);

    client.emitOffer({ ...OFFER, picked: "sharpEdge" });
    client.emitFlow(draftFlow());

    fireEvent.click(screen.getByText("vampiricEdge"));
    expect(client.pickPowerUp).not.toHaveBeenCalled();
  });

  it("shows opponents' current builds", () => {
    const client = new FakeGameClient();
    render(<DraftOverlay client={client as unknown as GameClient} />);

    client.emitOffer(OFFER);
    client.emitFlow(draftFlow());
    client.emitHud([
      { id: "me", isLocal: true, hp: 100, stamina: 100, weapon: "sword", action: "Idle", powerups: [] },
      opponent({ powerups: ["stoneSkin", "stoneSkin"] }),
    ]);

    expect(screen.getByText(/stoneSkin, stoneSkin/)).toBeDefined();
  });
});
