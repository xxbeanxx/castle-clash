import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { getRuntimeConfig } from "../config/runtime.js";
import { installE2eDebugHook } from "../game/debug.js";
import { GameClient } from "../game/GameClient.js";
import { resolveJoinIntent, storeReconnectionToken } from "../game/reconnection.js";
import { CombatHud } from "./CombatHud.js";
import { MatchBanner } from "./MatchBanner.js";
import { ResultsOverlay } from "./ResultsOverlay.js";

/** `roomId` is `"new"` for a not-yet-created room (quick play, or a private
 *  room to create/join by code from `mode`/`code` search params) — see
 *  `game/reconnection.ts`'s `resolveJoinIntent`. */
export function GameCanvas({ roomId }: { roomId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [client, setClient] = useState<GameClient | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const gameClient = new GameClient();
    setClient(gameClient);
    installE2eDebugHook(gameClient);
    const intent = resolveJoinIntent(roomId, searchParams);
    void gameClient
      .start(container, getRuntimeConfig().GAME_SERVER_URL, intent)
      .then(() => {
        const actualRoomId = gameClient.roomId;
        const token = gameClient.reconnectionToken;
        if (!actualRoomId || !token) {
          return;
        }
        storeReconnectionToken(actualRoomId, token);
        if (actualRoomId !== roomId) {
          // A display-only URL update (so a refresh/share rejoins this exact
          // room, and the reconnection-token lookup in `resolveJoinIntent`
          // has a real roomId to key off). Deliberately NOT react-router's
          // `navigate()`: that re-renders this route with a new `roomId`
          // prop, which would re-run this very effect against its own
          // dependency array and tear down the connection it just made.
          window.history.replaceState(null, "", `/play/${actualRoomId}${window.location.search}`);
        }
      })
      .catch((error: unknown) => {
        console.error("failed to start GameClient", error);
      });

    return () => {
      setClient(null);
      void gameClient.destroy();
    };
    // oxlint-disable-next-line react/exhaustive-deps -- `searchParams` intentionally excluded: it only matters for the initial join, and including it would re-run this effect (tearing down and rejoining) on every URL change.
  }, [roomId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        data-testid="game-canvas"
        style={{ width: "100%", height: "100%" }}
      />
      {client && <CombatHud client={client} />}
      {client && <MatchBanner client={client} />}
      {client && <ResultsOverlay client={client} />}
    </div>
  );
}
