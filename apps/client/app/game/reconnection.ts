import type { JoinIntent } from "./GameClient.js";

const KEY_PREFIX = "cc:reconnect:";

/** `sessionStorage` (not `localStorage`): a reconnection token is only good
 *  for `RECONNECTION_WINDOW_SECONDS`, and scoping it to the tab avoids
 *  stale tokens piling up across unrelated tabs/sessions. */
export function storeReconnectionToken(roomId: string, token: string): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + roomId, token);
  } catch {
    // Private browsing / storage disabled — reconnection just won't be
    // offered next time; the room is still joinable by id.
  }
}

function readReconnectionToken(roomId: string): string | null {
  try {
    return sessionStorage.getItem(KEY_PREFIX + roomId);
  } catch {
    return null;
  }
}

/**
 * Resolves the `/play/:roomId` route's params into a `JoinIntent` (plan
 * Phase 5 step 4): `roomId === "new"` means the room doesn't exist yet and
 * `mode`/`code` search params say how to create/join one; any other roomId
 * means rejoin it directly, preferring a stored reconnection token when one
 * is still around.
 */
export function resolveJoinIntent(roomId: string, searchParams: URLSearchParams): JoinIntent {
  if (roomId === "new") {
    const mode = searchParams.get("mode");
    const code = searchParams.get("code");
    if (mode === "tutorial") {
      return { kind: "tutorial" };
    }
    if (mode === "practice") {
      const bots = Math.floor(Number(searchParams.get("bots")));
      return {
        kind: "practice",
        botCount: Number.isFinite(bots) ? Math.min(3, Math.max(1, bots)) : 1,
        tier: searchParams.get("tier") ?? "normal",
        arenaId: searchParams.get("arena") ?? undefined,
      };
    }
    if (mode === "private") {
      // `arena` only matters for creating a room — joining an existing one
      // by code inherits whatever arena its host already picked.
      return code
        ? { kind: "joinPrivate", code }
        : { kind: "createPrivate", arenaId: searchParams.get("arena") ?? undefined };
    }
    return { kind: "quick" };
  }

  const token = readReconnectionToken(roomId);
  return token ? { kind: "reconnect", token } : { kind: "joinById", roomId };
}
