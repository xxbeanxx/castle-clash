import { useEffect, useRef, useState } from "react";
import { getRuntimeConfig } from "../config/runtime.js";
import { GameClient } from "../game/GameClient.js";
import { CombatHud } from "./CombatHud.js";

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [client, setClient] = useState<GameClient | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const gameClient = new GameClient();
    setClient(gameClient);
    void gameClient
      .start(container, getRuntimeConfig().GAME_SERVER_URL)
      .catch((error: unknown) => {
        console.error("failed to start GameClient", error);
      });

    return () => {
      setClient(null);
      void gameClient.destroy();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        data-testid="game-canvas"
        style={{ width: "100%", height: "100%" }}
      />
      {client && <CombatHud client={client} />}
    </div>
  );
}
