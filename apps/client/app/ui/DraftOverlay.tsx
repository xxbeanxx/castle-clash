import { TICK_RATE } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import type { DraftOfferSnapshot } from "../game/GameClient.js";
import type { GameClient } from "../game/GameClient.js";
import type { HudPlayerSnapshot } from "../game/hud.js";
import type { MatchFlowSnapshot } from "../game/matchFlow.js";
import { powerUpCard, powerUpName } from "../content/powerups.js";
import { PowerUpIcon } from "./PowerUpIcon.js";

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
    <div data-testid="draft-overlay" className="cc-overlay">
      <div className="cc-overlay__title">
        Choose a power-up{seconds !== null ? ` · ${seconds}s` : ""}
      </div>

      <div className="cc-draft-cards">
        {offer.offers.map((id) => {
          const isPicked = offer.picked === id;
          const disabled = offer.picked !== null;
          const card = powerUpCard(id);
          return (
            <button
              key={id}
              type="button"
              data-testid="draft-card"
              data-rarity={card.rarity ?? undefined}
              disabled={disabled}
              onClick={() => client.pickPowerUp(id)}
              className={isPicked ? "cc-draft-card cc-draft-card--picked" : "cc-draft-card"}
            >
              <PowerUpIcon id={id} />
              <span className="cc-draft-card__name">{card.name}</span>
              {card.rarity && <span className="cc-draft-card__rarity">{card.rarity}</span>}
              {card.lines.map((line) => (
                <span key={line} className="cc-draft-card__line">
                  {line}
                </span>
              ))}
              {card.stacks && <span className="cc-draft-card__stacks">{card.stacks}</span>}
            </button>
          );
        })}
      </div>

      {opponents.length > 0 && (
        <div className="cc-draft-opponents">
          {opponents.map((player) => (
            <div key={player.id}>
              Opponent:{" "}
              {player.powerups.length > 0
                ? player.powerups.map(powerUpName).join(", ")
                : "no power-ups yet"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
