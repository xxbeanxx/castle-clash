import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GameClient } from "../game/GameClient.js";
import type { HudPlayerSnapshot } from "../game/hud.js";
import { CombatHud } from "./CombatHud.js";

function snapshot(overrides: Partial<HudPlayerSnapshot>): HudPlayerSnapshot {
  return {
    id: "p",
    name: "",
    isLocal: false,
    isBot: false,
    hp: 100,
    stamina: 100,
    weapon: "sword",
    action: "Idle",
    powerups: [],
    ...overrides,
  };
}

function renderHud(snapshots: HudPlayerSnapshot[]) {
  const client = {
    subscribeHud: (listener: (next: HudPlayerSnapshot[]) => void) => {
      listener(snapshots);
      return () => {};
    },
  } as unknown as GameClient;
  render(<CombatHud client={client} />);
}

describe("CombatHud labels", () => {
  afterEach(cleanup);

  it("labels each player by name, marking the local one", () => {
    renderHud([
      snapshot({ id: "a", name: "Sir_Kay", isLocal: true }),
      snapshot({ id: "b", name: "Guest-7F3A" }),
    ]);

    expect(screen.getByText(/Sir_Kay \(you\)/)).toBeDefined();
    expect(screen.getByText(/Guest-7F3A/)).toBeDefined();
  });

  it("falls back to You / Opponent when the server sent no names", () => {
    renderHud([snapshot({ id: "a", isLocal: true }), snapshot({ id: "b" })]);

    expect(screen.getByText(/^You ·/)).toBeDefined();
    expect(screen.getByText(/^Opponent ·/)).toBeDefined();
  });
});

describe("CombatHud — bots", () => {
  afterEach(cleanup);

  it("labels a bot as a bot and a person by name alone", () => {
    renderHud([
      snapshot({ id: "me", name: "Sir_Kay", isLocal: true }),
      snapshot({ id: "bot-0", name: "Sir Aldric", isBot: true }),
    ]);

    expect(screen.getByText(/Sir_Kay \(you\)/)).toBeDefined();
    expect(screen.getByText(/Sir Aldric \(bot\)/)).toBeDefined();
  });
});
