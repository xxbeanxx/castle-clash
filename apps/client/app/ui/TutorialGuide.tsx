import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { safeNextPath } from "../auth/nextPath.js";
import type { GameClient } from "../game/GameClient.js";
import type { HudPlayerSnapshot } from "../game/hud.js";
import type { RoomInfoSnapshot } from "../game/roomInfo.js";
import {
  advanceTutorial,
  currentTutorialStep,
  TUTORIAL_STEPS,
  type TutorialStepId,
} from "../game/tutorial.js";
import { Button } from "./kit/index.js";
import { markTutorialSeen } from "./tutorialSeen.js";

function usesTouch(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

/**
 * The first-run tutorial's coach (Phase 14 step 4): shown only in a `tutorial` room, it names the
 * step to do (in words for a keyboard or for touch, whichever this device is) and ticks it off as
 * the player's own synced state shows it done. Skippable at any point, and marks the tutorial as
 * seen the moment it appears, so quitting halfway never brings it back uninvited.
 */
export function TutorialGuide({ client }: { client: GameClient }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [info, setInfo] = useState<RoomInfoSnapshot | null>(null);
  const [done, setDone] = useState<ReadonlySet<TutorialStepId>>(new Set());
  const [dismissed, setDismissed] = useState(false);
  const inTutorial = info?.mode === "tutorial";

  useEffect(() => client.subscribeRoomInfo(setInfo), [client]);

  useEffect(() => {
    if (inTutorial) {
      markTutorialSeen();
    }
  }, [inTutorial]);

  useEffect(() => {
    if (!inTutorial) {
      return;
    }
    return client.subscribeHud((snapshots: HudPlayerSnapshot[]) => {
      const me = snapshots.find((snapshot) => snapshot.isLocal);
      if (me) {
        setDone((current) => advanceTutorial(current, me));
      }
    });
  }, [client, inTutorial]);

  if (!inTutorial || dismissed) {
    return null;
  }

  const next = safeNextPath(searchParams.get("next")) ?? "/lobby";
  const step = currentTutorialStep(done);
  const touch = usesTouch();
  const leave = () => navigate(next);

  return (
    <section data-testid="tutorial-guide" className="cc-tutorial" aria-label="Tutorial">
      {step ? (
        <>
          <p className="cc-tutorial__count">
            Step {TUTORIAL_STEPS.findIndex((candidate) => candidate.id === step.id) + 1} of{" "}
            {TUTORIAL_STEPS.length}: {step.title}
          </p>
          <p data-testid="tutorial-prompt" className="cc-tutorial__prompt" role="status">
            {touch ? step.touch : step.keyboard}
          </p>
          <ol className="cc-tutorial__steps" aria-label="Lessons">
            {TUTORIAL_STEPS.map((candidate) => (
              <li
                key={candidate.id}
                className={done.has(candidate.id) ? "cc-tutorial__step--done" : undefined}
                aria-current={candidate.id === step.id ? "step" : undefined}
              >
                {candidate.title}
              </li>
            ))}
          </ol>
          <Button size="sm" variant="ghost" onClick={leave}>
            Skip tutorial
          </Button>
        </>
      ) : (
        <>
          <p data-testid="tutorial-complete" className="cc-tutorial__prompt" role="status">
            You are ready. Go and find a fight.
          </p>
          <div className="cc-row">
            <Button size="sm" variant="primary" onClick={leave}>
              Continue
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Keep training
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
