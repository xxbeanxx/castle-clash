import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GameClient } from "../game/GameClient.js";
import type { HudPlayerSnapshot } from "../game/hud.js";
import type { RoomInfoSnapshot } from "../game/roomInfo.js";
import { TutorialGuide } from "./TutorialGuide.js";
import { tutorialSeen } from "./tutorialSeen.js";

class FakeClient {
  readonly #info = new Set<(info: RoomInfoSnapshot) => void>();
  readonly #hud = new Set<(snapshots: HudPlayerSnapshot[]) => void>();

  subscribeRoomInfo(listener: (info: RoomInfoSnapshot) => void): () => void {
    this.#info.add(listener);
    return () => this.#info.delete(listener);
  }
  subscribeHud(listener: (snapshots: HudPlayerSnapshot[]) => void): () => void {
    this.#hud.add(listener);
    return () => this.#hud.delete(listener);
  }
  emitInfo(mode: string): void {
    act(() =>
      this.#info.forEach((listener) =>
        listener({ mode, backfillOfferable: false, wantsRematch: false, humans: 1, botIds: [] }),
      ),
    );
  }
  emitPlayer(overrides: Partial<HudPlayerSnapshot>): void {
    const me: HudPlayerSnapshot = {
      id: "me",
      name: "Me",
      isLocal: true,
      isBot: false,
      hp: 100,
      stamina: 100,
      weapon: "sword",
      action: "Idle",
      attackKind: "",
      dropThroughTicks: 0,
      grounded: true,
      y: 632,
      powerups: [],
      ...overrides,
    };
    act(() => this.#hud.forEach((listener) => listener([me])));
  }
}

function renderGuide(url = "/play/x?mode=tutorial&next=%2Fhow-to-play") {
  const client = new FakeClient();
  const router = createMemoryRouter(
    [
      {
        path: "/play/:roomId",
        element: <TutorialGuide client={client as unknown as GameClient} />,
      },
      { path: "/how-to-play", element: <p>how to play route</p> },
      { path: "/lobby", element: <p>lobby route</p> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return { client, router };
}

function setCoarsePointer(coarse: boolean): void {
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: coarse && query.includes("coarse") }),
  });
}

describe("TutorialGuide", () => {
  beforeEach(() => {
    localStorage.clear();
    setCoarsePointer(false);
  });
  afterEach(cleanup);

  it("says nothing outside a tutorial room", () => {
    const { client } = renderGuide();
    client.emitInfo("quick");
    expect(screen.queryByTestId("tutorial-guide")).toBeNull();
    expect(tutorialSeen()).toBe(false);
  });

  it("opens on the first step, and counts the tutorial as seen from that moment", () => {
    const { client } = renderGuide();
    client.emitInfo("tutorial");

    expect(screen.getByText("Step 1 of 7: Move")).toBeDefined();
    expect(tutorialSeen()).toBe(true);
  });

  it("words a step for a keyboard by default and for touch on a touch device", () => {
    const keyboard = renderGuide();
    keyboard.client.emitInfo("tutorial");
    expect(screen.getByTestId("tutorial-prompt").textContent).toContain("A and D");
    cleanup();

    setCoarsePointer(true);
    const touch = renderGuide();
    touch.client.emitInfo("tutorial");
    expect(screen.getByTestId("tutorial-prompt").textContent).toContain("stick");
  });

  it("ticks steps off as the player does them, in order", () => {
    const { client } = renderGuide();
    client.emitInfo("tutorial");

    client.emitPlayer({ action: "Run" });
    expect(screen.getByText("Step 2 of 7: Jump")).toBeDefined();
    client.emitPlayer({ action: "Airborne", grounded: false });
    expect(screen.getByText("Step 3 of 7: Drop through")).toBeDefined();
    expect(screen.getByText("Move").className).toContain("done");
  });

  it("finishes with a way out, and Continue goes where the player was headed", () => {
    const { client, router } = renderGuide();
    client.emitInfo("tutorial");
    for (const overrides of [
      { action: "Run" },
      { action: "Airborne", grounded: false },
      { dropThroughTicks: 8, y: 512 },
      { action: "AttackStartup", attackKind: "light" },
      { action: "AttackStartup", attackKind: "heavy" },
      { action: "Block" },
      { action: "Dodge" },
    ]) {
      client.emitPlayer(overrides);
    }

    expect(screen.getByTestId("tutorial-complete")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(router.state.location.pathname).toBe("/how-to-play");
  });

  it("can be skipped at any point, and skipping goes where the player was headed", () => {
    const { client, router } = renderGuide();
    client.emitInfo("tutorial");
    fireEvent.click(screen.getByRole("button", { name: "Skip tutorial" }));
    expect(router.state.location.pathname).toBe("/how-to-play");
    void client;
  });

  it("only ever navigates to a same-origin path, whatever `next` says", () => {
    const { client, router } = renderGuide(
      "/play/x?mode=tutorial&next=https%3A%2F%2Fevil.example%2F",
    );
    client.emitInfo("tutorial");
    fireEvent.click(screen.getByRole("button", { name: "Skip tutorial" }));
    expect(router.state.location.pathname).toBe("/lobby");
  });

  it("Keep training dismisses the coach and leaves the room running", () => {
    const { client, router } = renderGuide();
    client.emitInfo("tutorial");
    for (const overrides of [
      { action: "Run" },
      { action: "Airborne", grounded: false },
      { dropThroughTicks: 8, y: 512 },
      { action: "AttackStartup", attackKind: "light" },
      { action: "AttackStartup", attackKind: "heavy" },
      { action: "Block" },
      { action: "Dodge" },
    ]) {
      client.emitPlayer(overrides);
    }
    fireEvent.click(screen.getByRole("button", { name: "Keep training" }));

    expect(screen.queryByTestId("tutorial-guide")).toBeNull();
    expect(router.state.location.pathname).toBe("/play/x");
  });
});
