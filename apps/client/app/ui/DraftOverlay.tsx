import { TICK_RATE } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import type { DraftOfferSnapshot } from "../game/GameClient.js";
import type { GameClient } from "../game/GameClient.js";
import type { HudPlayerSnapshot } from "../game/hud.js";
import type { MatchFlowSnapshot } from "../game/matchFlow.js";

/**
 * Three power-up cards, a countdown, and opponents' current builds (plan
 * Phase 7 step 5) — an ordinary React component reacting to
 * `GameClient.subscribeDraftOffer`/`subscribeHud`/`subscribeMatchFlow`,
 * never the ticker loop, so it renders and updates correctly even in this
 * environment's known `requestAnimationFrame`-frozen state (see
 * `feedback_verify_client_live.md`).
 */
export function DraftOverlay({ client }: { client: GameClient }) {
  const [offer, setOffer] = useState<DraftOfferSnapshot | null>(null);
  const [flow, setFlow] = useState<MatchFlowSnapshot | null>(null);
  const [hud, setHud] = useState<HudPlayerSnapshot[]>([]);

  useEffect(() => client.subscribeDraftOffer(setOffer), [client]);
  useEffect(() => client.subscribeMatchFlow(setFlow), [client]);
  useEffect(() => client.subscribeHud(setHud), [client]);

  if (!offer || flow?.phase !== "Draft") {
    return null;
  }

  const seconds = flow.ticksRemaining !== null ? Math.ceil(flow.ticksRemaining / TICK_RATE) : null;
  const opponents = hud.filter((player) => !player.isLocal);

  return (
    <div
      data-testid="draft-overlay"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 600 }}>
        Choose a power-up{seconds !== null ? ` · ${seconds}s` : ""}
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {offer.offers.map((id) => {
          const isPicked = offer.picked === id;
          const disabled = offer.picked !== null;
          return (
            <button
              key={id}
              type="button"
              data-testid="draft-card"
              disabled={disabled}
              onClick={() => client.pickPowerUp(id)}
              style={{
                width: 140,
                height: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: 8,
                borderRadius: 8,
                border: isPicked ? "2px solid #6c6" : "2px solid #fff",
                background: isPicked ? "rgba(102,204,102,0.25)" : "rgba(255,255,255,0.08)",
                color: "#fff",
                fontSize: 14,
                cursor: disabled ? "default" : "pointer",
                opacity: disabled && !isPicked ? 0.5 : 1,
              }}
            >
              {id}
            </button>
          );
        })}
      </div>

      {opponents.length > 0 && (
        <div style={{ fontSize: 12, opacity: 0.85, textAlign: "center" }}>
          {opponents.map((player) => (
            <div key={player.id}>
              Opponent: {player.powerups.length > 0 ? player.powerups.join(", ") : "no power-ups yet"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
