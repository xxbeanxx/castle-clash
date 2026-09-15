import { useEffect, useRef } from "react";
import { getRuntimeConfig } from "../config/runtime.js";
import { GameClient } from "../game/GameClient.js";

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const client = new GameClient();
    void client.start(container, getRuntimeConfig().GAME_SERVER_URL).catch((error: unknown) => {
      console.error("failed to start GameClient", error);
    });

    return () => {
      void client.destroy();
    };
  }, []);

  return (
    <div ref={containerRef} data-testid="game-canvas" style={{ width: "100%", height: "100%" }} />
  );
}
