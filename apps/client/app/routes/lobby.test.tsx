import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import Lobby from "./lobby.js";

function renderLobby() {
  const router = createMemoryRouter(
    [
      { path: "/lobby", Component: Lobby },
      { path: "/play/:roomId", Component: () => <p>play route</p> },
    ],
    { initialEntries: ["/lobby"] },
  );
  return { router };
}

describe("Lobby route", () => {
  afterEach(() => {
    cleanup();
  });

  it("navigates to /play/new on quick play", () => {
    const { router } = renderLobby();
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByText("Quick play"));

    expect(router.state.location.pathname).toBe("/play/new");
  });

  it("navigates to /play/new?mode=private on create private room", () => {
    const { router } = renderLobby();
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByText("Create private room"));

    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/play/new?mode=private",
    );
  });

  it("navigates to /play/new?mode=private&arena=pit when a specific arena is picked", () => {
    const { router } = renderLobby();
    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByLabelText("Arena"), { target: { value: "pit" } });
    fireEvent.click(screen.getByText("Create private room"));

    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/play/new?mode=private&arena=pit",
    );
  });

  it("navigates to /play/new?mode=private&code=... on joining a code", () => {
    const { router } = renderLobby();
    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "abc123" } });
    fireEvent.click(screen.getByText("Join"));

    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/play/new?mode=private&code=ABC123",
    );
  });

  it("does not navigate when submitting an empty code", () => {
    const { router } = renderLobby();
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByText("Join"));

    expect(router.state.location.pathname).toBe("/lobby");
  });
});
