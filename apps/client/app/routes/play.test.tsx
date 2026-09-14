import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Play from "./play.js";

const startMock = vi.fn().mockResolvedValue(undefined);
const destroyMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../game/GameClient.js", () => ({
  GameClient: vi.fn().mockImplementation(function GameClient() {
    return { start: startMock, destroy: destroyMock };
  }),
}));

vi.mock("../config/runtime.js", () => ({
  getRuntimeConfig: () => ({ GAME_SERVER_URL: "ws://example.test:2567" }),
}));

describe("Play route", () => {
  afterEach(() => {
    cleanup();
    startMock.mockClear();
    destroyMock.mockClear();
  });

  it("starts the GameClient on mount with the container and configured room URL", () => {
    render(<Play />);

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(expect.any(HTMLElement), "ws://example.test:2567");
  });

  it("destroys the GameClient on unmount", () => {
    const { unmount } = render(<Play />);

    unmount();

    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});
