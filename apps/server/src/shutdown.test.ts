import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installGracefulShutdown,
  isDraining,
  resetDrainingForTests,
  trackPendingWrite,
  type Drainable,
} from "./shutdown.js";

describe("installGracefulShutdown", () => {
  afterEach(() => {
    resetDrainingForTests();
  });

  it("sets isDraining() true and exits 0 once the server gracefully shuts down", async () => {
    let sigtermHandler: (() => void) | undefined;
    const exit = vi.fn();
    const gracefullyShutdown = vi.fn().mockResolvedValue(undefined);
    const server: Drainable = { gracefullyShutdown };

    installGracefulShutdown(server, {
      onSignal: (handler) => {
        sigtermHandler = handler;
      },
      exit,
    });

    expect(isDraining()).toBe(false);
    sigtermHandler!();
    // `drain()` is fire-and-forget from `installGracefulShutdown`'s
    // perspective (it's inside the `onSignal` callback, not awaited) — give
    // its internal awaits a turn before asserting.
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(isDraining()).toBe(true);
    expect(gracefullyShutdown).toHaveBeenCalledWith(false);
  });

  it("force-disconnects and exits once the drain timeout is exceeded, without waiting for gracefullyShutdown", async () => {
    vi.useFakeTimers();
    try {
      let sigtermHandler: (() => void) | undefined;
      const exit = vi.fn();
      // Never resolves — simulates a room stuck past MatchOver.
      const gracefullyShutdown = vi.fn().mockReturnValue(new Promise<void>(() => {}));
      const disconnectAll = vi.fn().mockReturnValue([Promise.resolve()]);
      const server: Drainable = { gracefullyShutdown };

      installGracefulShutdown(server, {
        drainTimeoutMs: 1000,
        onSignal: (handler) => {
          sigtermHandler = handler;
        },
        exit,
        disconnectAll,
      });

      sigtermHandler!();
      await vi.advanceTimersByTimeAsync(1000);

      expect(disconnectAll).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for tracked post-match writes before exiting, even after the rooms are gone", async () => {
    let sigtermHandler: (() => void) | undefined;
    const exit = vi.fn();
    let finishWrite!: () => void;
    trackPendingWrite(new Promise<void>((resolve) => (finishWrite = resolve)));

    installGracefulShutdown(
      { gracefullyShutdown: vi.fn().mockResolvedValue(undefined) },
      {
        onSignal: (handler) => {
          sigtermHandler = handler;
        },
        exit,
      },
    );
    sigtermHandler!();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exit).not.toHaveBeenCalled();
    finishWrite();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it("does not force-disconnect when gracefullyShutdown finishes before the timeout", async () => {
    vi.useFakeTimers();
    try {
      let sigtermHandler: (() => void) | undefined;
      const exit = vi.fn();
      const gracefullyShutdown = vi.fn().mockResolvedValue(undefined);
      const disconnectAll = vi.fn().mockReturnValue([]);
      const server: Drainable = { gracefullyShutdown };

      installGracefulShutdown(server, {
        drainTimeoutMs: 60_000,
        onSignal: (handler) => {
          sigtermHandler = handler;
        },
        exit,
        disconnectAll,
      });

      sigtermHandler!();
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

      expect(disconnectAll).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
