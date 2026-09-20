import { TICK_RATE } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import type { GameClient } from "../game/GameClient.js";
import type { MatchFlowSnapshot } from "../game/matchFlow.js";

const PHASE_LABEL: Readonly<Record<string, string>> = {
  Waiting: "Waiting for players…",
  Countdown: "Get ready",
  RoundActive: "Fight!",
  RoundOver: "Round over",
  Draft: "Choosing power-ups…",
  MatchOver: "Match over",
};

/**
 * The phase banner + countdown the plan's `play.$roomId` route calls for —
 * pushed straight off `GameClient.subscribeMatchFlow`/`subscribeMatchCode`,
 * so it needs no polling and never renders faster than the server actually
 * has something new to say (`PATCH_RATE`).
 */
export function MatchBanner({ client }: { client: GameClient }) {
  const [flow, setFlow] = useState<MatchFlowSnapshot | null>(null);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => client.subscribeMatchFlow(setFlow), [client]);
  useEffect(() => client.subscribeMatchCode(setCode), [client]);

  if (!flow || flow.phase === "MatchOver") {
    return null;
  }

  const seconds = flow.ticksRemaining !== null ? Math.ceil(flow.ticksRemaining / TICK_RATE) : null;

  return (
    <div
      data-testid="match-banner"
      className={flow.suddenDeath ? "cc-banner cc-banner--sudden-death" : "cc-banner"}
    >
      <div className="cc-banner__phase">
        {flow.suddenDeath ? "Sudden death" : (PHASE_LABEL[flow.phase] ?? flow.phase)}
        {flow.round > 0 ? ` · Round ${flow.round}` : ""}
        {seconds !== null ? ` · ${seconds}s` : ""}
      </div>
      {code && flow.phase === "Waiting" && (
        <div className="cc-banner__code">Share this code: {code}</div>
      )}
    </div>
  );
}
