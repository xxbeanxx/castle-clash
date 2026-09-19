import { MAX_HP, MAX_STAMINA } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import type { GameClient } from "../game/GameClient.js";
import type { HudPlayerSnapshot } from "../game/hud.js";

function Bar({ value, max, kind }: { value: number; max: number; kind: "hp" | "stamina" }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div className="cc-bar">
      <div className={`cc-bar__fill cc-bar__fill--${kind}`} style={{ width: `${pct}%` }} />
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

  // The server names every player (a chosen display name or `Guest-XXXX`).
  // Without a name (an older server) "Opponent" reads fine for a 1v1 duel;
  // with 3+ players (ADR 0001 sizes the sim for up to 8) each non-local
  // player needs its own label, so fall back to a short id suffix.
  const labelFor = (player: HudPlayerSnapshot): string => {
    if (player.name) {
      return player.isLocal ? `${player.name} (you)` : player.name;
    }
    if (player.isLocal) {
      return "You";
    }
    return snapshots.length > 2 ? `Opponent ${player.id.slice(0, 4)}` : "Opponent";
  };

  return (
    <div data-testid="combat-hud" className="cc-hud">
      {snapshots.map((player) => (
        <div key={player.id} className="cc-hud__player">
          <div className="cc-hud__label">
            {labelFor(player)} · {player.weapon} · {player.action}
          </div>
          <Bar value={player.hp} max={MAX_HP} kind="hp" />
          <Bar value={player.stamina} max={MAX_STAMINA} kind="stamina" />
        </div>
      ))}
    </div>
  );
}
