import { matchMaker } from "colyseus";
import { logger } from "./logger.js";

/** Plan step 1's own example figure — generous enough for a round to
 *  naturally reach `MatchOver`, small enough that a genuinely stuck room
 *  (e.g. `Waiting` forever with no second player) doesn't block a deploy
 *  indefinitely. */
const DEFAULT_DRAIN_TIMEOUT_MS = 10 * 60 * 1000;

let draining = false;

/** Post-match writes (`recordMatch` + unlock grants) are fire-and-forget from
 *  the room's perspective, and can still be retrying with backoff after the
 *  room itself has been released. `drain()` awaits these before `exit` — a
 *  process that exits with a match result still unwritten loses it, which is
 *  the one thing a graceful drain must not do. */
const pendingWrites = new Set<Promise<unknown>>();

export function trackPendingWrite(write: Promise<unknown>): void {
  pendingWrites.add(write);
  void write.finally(() => pendingWrites.delete(write)).catch(() => {});
}

/** Read by `http.ts`'s `/readyz` (503 while draining) and `MatchRoom.
 *  onCreate` (rejects new rooms while draining) — plan step 1: "the server
 *  stops accepting new rooms" and "`/readyz` returns 503 while draining." */
export function isDraining(): boolean {
  return draining;
}

/** Test-only — `draining` is otherwise a one-way flag for the process's
 *  whole remaining lifetime (a real server never un-drains). */
export function resetDrainingForTests(): void {
  draining = false;
}

/** The one method `installGracefulShutdown` actually calls on the server —
 *  a real `colyseus` `Server`'s `gracefullyShutdown(exit?, err?)` already
 *  satisfies this structurally, so a test can inject a minimal fake instead
 *  of booting a real `Server`/`matchMaker` singleton (whose `SHUTTING_DOWN`
 *  state has no way back once set, which would poison every other test
 *  sharing this test file's module instance). */
export interface Drainable {
  gracefullyShutdown(exit: boolean): Promise<void>;
}

export interface GracefulShutdownOptions {
  drainTimeoutMs?: number;
  /** Test seam — replaces `process.exit`. */
  exit?: (code: number) => void;
  /** Test seam — replaces the `SIGTERM` subscription. */
  onSignal?: (handler: () => void) => void;
  /** Test seam — replaces `matchMaker.disconnectAll()`, the force-
   *  disconnect fallback when the drain timeout is exceeded. */
  disconnectAll?: () => Promise<unknown>[];
}

/**
 * Plan Phase 10 step 1: "on `SIGTERM` the server stops accepting new rooms,
 * lets running matches finish up to a `DRAIN_TIMEOUT` ..., then disposes."
 * Colyseus's built-in graceful shutdown (`ServerOptions.gracefullyShutdown`,
 * on by default) does two things this needs to differ from: it waits for
 * every room to dispose with **no timeout at all**, and its default
 * `Room.onBeforeShutdown()` disconnects every client at once, so it never
 * "lets running matches finish" in the first place (`MatchRoom` overrides
 * `onBeforeShutdown` for that half). Callers must pass `gracefullyShutdown:
 * false` to `defineServer(...)` and call this instead, which races Colyseus's
 * own `server.gracefullyShutdown(false)` (exit disabled — this function
 * controls `process.exit` itself) against `drainTimeoutMs`, force-
 * disconnecting any still-active rooms if the timeout wins.
 */
export function installGracefulShutdown(
  server: Drainable,
  options: GracefulShutdownOptions = {},
): void {
  const drainTimeoutMs = options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const disconnectAll = options.disconnectAll ?? (() => matchMaker.disconnectAll());
  const subscribe = options.onSignal ?? ((handler: () => void) => process.once("SIGTERM", handler));

  subscribe(() => {
    void drain(server, drainTimeoutMs, exit, disconnectAll);
  });
}

async function drain(
  server: Drainable,
  drainTimeoutMs: number,
  exit: (code: number) => void,
  disconnectAll: () => Promise<unknown>[],
): Promise<void> {
  draining = true;
  logger.info({ drainTimeoutMs }, "shutdown: draining, waiting for in-progress matches to finish");

  const timedOut = Symbol("drain-timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    server.gracefullyShutdown(false).then(() => "graceful" as const),
    new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), drainTimeoutMs);
    }),
  ]);
  clearTimeout(timer);

  if (result === timedOut) {
    logger.warn(
      { drainTimeoutMs },
      "shutdown: drain timeout exceeded, force-disconnecting remaining rooms",
    );
    await Promise.all(disconnectAll());
  } else {
    logger.info("shutdown: all rooms drained gracefully");
  }

  // `allSettled`: a failed write already logged/counted itself in
  // `RecordMatchQueue`; it must not stop the process from exiting.
  await Promise.allSettled([...pendingWrites]);

  exit(0);
}
