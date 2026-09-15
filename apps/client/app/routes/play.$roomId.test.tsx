import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import Play from "./play.$roomId.js";

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
  });

  it("starts the GameClient with a quick-play intent for a new room", () => {
    renderAt("/play/new");

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(expect.any(HTMLElement), "ws://example.test:2567", {
      kind: "quick",
    });
  });

  it("starts the GameClient with a joinById intent for an existing room id", () => {
    renderAt("/play/room-42");

    expect(startMock).toHaveBeenCalledWith(expect.any(HTMLElement), "ws://example.test:2567", {
      kind: "joinById",
      roomId: "room-42",
    });
  });

  it("destroys the GameClient on unmount", () => {
    const { unmount } = renderAt("/play/new");

    unmount();

    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});
