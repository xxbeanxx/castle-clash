import { MAX_HP, MAX_STAMINA } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import type { GameClient } from "../game/GameClient.js";
import type { HudPlayerSnapshot } from "../game/hud.js";

const BAR_WIDTH = 180;

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div
      style={{
        width: BAR_WIDTH,
        height: 10,
        background: "rgba(0,0,0,0.5)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          transition: "width 100ms linear",
        }}
      />
    </div>
  );
}

/**
 * HP/stamina bars fed by `GameClient.subscribeHud` — pushed once per server
 * patch (throttled to `PATCH_RATE`), not on every Pixi render frame, so
 * React never re-renders faster than the network actually has new combat
 * state to show.
 */
export function CombatHud({ client }: { client: GameClient }) {
  const [snapshots, setSnapshots] = useState<HudPlayerSnapshot[]>([]);

  useEffect(() => client.subscribeHud(setSnapshots), [client]);

  if (snapshots.length === 0) {
    return null;
  }

  // "Opponent" reads fine for a 1v1 duel; with 3+ players (a later phase's
  // matches — ADR 0001 sizes the sim for up to 8) each non-local player
  // needs its own label, so fall back to a short id suffix once there's
  // more than one to distinguish.
  const labelFor = (player: HudPlayerSnapshot): string => {
    if (player.isLocal) {
      return "You";
    }
    return snapshots.length > 2 ? `Opponent ${player.id.slice(0, 4)}` : "Opponent";
  };

  return (
    <div
      data-testid="combat-hud"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        right: 12,
        display: "flex",
        justifyContent: "space-between",
        pointerEvents: "none",
        fontFamily: "sans-serif",
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      }}
    >
      {snapshots.map((player) => (
        <div key={player.id} style={{ minWidth: BAR_WIDTH }}>
          <div style={{ fontSize: 12, marginBottom: 2 }}>
            {labelFor(player)} · {player.weapon} · {player.action}
          </div>
          <Bar value={player.hp} max={MAX_HP} color="#e33" />
          <div style={{ height: 4 }} />
          <Bar value={player.stamina} max={MAX_STAMINA} color="#fc3" />
        </div>
      ))}
    </div>
  );
}
