import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import Play, { clientLoader } from "./play.$roomId.js";

const startMock = vi.fn().mockResolvedValue(undefined);
const destroyMock = vi.fn().mockResolvedValue(undefined);
const subscribeHudMock = vi.fn().mockReturnValue(() => {});
const subscribeMatchFlowMock = vi.fn().mockReturnValue(() => {});
const subscribeMatchCodeMock = vi.fn().mockReturnValue(() => {});
const subscribeMatchResultMock = vi.fn().mockReturnValue(() => {});

vi.mock("../game/GameClient.js", () => ({
  GameClient: vi.fn().mockImplementation(function GameClient() {
    return {
      start: startMock,
      destroy: destroyMock,
      subscribeHud: subscribeHudMock,
      subscribeMatchFlow: subscribeMatchFlowMock,
      subscribeMatchCode: subscribeMatchCodeMock,
      subscribeMatchResult: subscribeMatchResultMock,
      roomId: "resolved-room-1",
      reconnectionToken: "token-1",
    };
  }),
}));

vi.mock("../config/runtime.js", () => ({
  getRuntimeConfig: () => ({ GAME_SERVER_URL: "ws://example.test:2567" }),
}));

const getSessionMock = vi.fn().mockResolvedValue({ access_token: "test-access-token" });

vi.mock("../auth/supabase.js", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  getSession: () => getSessionMock(),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: "/play/:roomId", Component: Play }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Play/$roomId route", () => {
  afterEach(() => {
    cleanup();
    startMock.mockClear();
    destroyMock.mockClear();
    getSessionMock.mockReset().mockResolvedValue({ access_token: "test-access-token" });
  });

  it("redirects to /login when clientLoader runs with no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const router = createMemoryRouter(
      [
        { path: "/play/:roomId", Component: Play, loader: clientLoader },
        { path: "/login", Component: () => <p>login route</p> },
      ],
      { initialEntries: ["/play/new"] },
    );
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(startMock).not.toHaveBeenCalled();
  });

  it("starts the GameClient with a quick-play intent and the fetched access token for a new room", async () => {
    renderAt("/play/new");

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(startMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      "ws://example.test:2567",
      { kind: "quick" },
      "test-access-token",
    );
  });

  it("starts the GameClient with a joinById intent for an existing room id", async () => {
    renderAt("/play/room-42");

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(startMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      "ws://example.test:2567",
      { kind: "joinById", roomId: "room-42" },
      "test-access-token",
    );
  });

  it("destroys the GameClient on unmount", () => {
    const { unmount } = renderAt("/play/new");

    unmount();

    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});
