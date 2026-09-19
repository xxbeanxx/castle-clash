import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { ConnectionState, GameClient } from "../game/GameClient.js";
import { ConnectionOverlay } from "./ConnectionOverlay.js";

function setup(initial: ConnectionState = "connected") {
  let push: (state: ConnectionState) => void = () => {};
  const client = {
    subscribeConnection: (listener: (state: ConnectionState) => void) => {
      push = listener;
      listener(initial);
      return () => {};
    },
  } as unknown as GameClient;
  render(
    <MemoryRouter>
      <ConnectionOverlay client={client} />
    </MemoryRouter>,
  );
  return (state: ConnectionState) => act(() => push(state));
}

describe("ConnectionOverlay", () => {
  afterEach(cleanup);

  it("renders nothing while connected", () => {
    setup();
    expect(screen.queryByTestId("connection-overlay")).toBeNull();
  });

  it("shows Reconnecting while the socket is retried, then clears", () => {
    const push = setup();
    push("reconnecting");
    expect(screen.getByRole("status").textContent).toContain("Reconnecting");
    push("connected");
    expect(screen.queryByTestId("connection-overlay")).toBeNull();
  });

  it("offers a way back to the lobby once the connection is lost", () => {
    const push = setup();
    push("lost");
    expect(screen.getByText("Connection lost.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to the lobby" }).getAttribute("href")).toBe(
      "/lobby",
    );
  });
});
