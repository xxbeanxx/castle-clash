import { useEffect, useState } from "react";
import type { GameClient } from "../game/GameClient.js";
import type { RoomInfoSnapshot } from "../game/roomInfo.js";
import { Button } from "./kit/index.js";

const NOTICE_MS = 6000;

const TIERS = [
  { tier: "easy", label: "Easy" },
  { tier: "normal", label: "Normal" },
  { tier: "hard", label: "Hard" },
] as const;

/**
 * "Play a bot while you wait" (decision D4): shown only once the server says the lone player has
 * waited long enough (`backfillOfferable`), and only ever acts on a click. Nothing here starts a
 * match by itself; declining is just not clicking, and the offer stays until someone arrives.
 */
export function BackfillPrompt({ client }: { client: GameClient }) {
  const [info, setInfo] = useState<RoomInfoSnapshot | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => client.subscribeRoomInfo(setInfo), [client]);

  // A fresh offer (after a bot left, say) should not inherit an old "asked".
  const offered = info?.mode === "quick" && info.backfillOfferable;
  useEffect(() => {
    if (!offered) {
      setAsked(false);
    }
  }, [offered]);

  if (!offered) {
    return null;
  }

  return (
    <section data-testid="backfill-prompt" className="cc-backfill" aria-label="Play a bot">
      <p className="cc-backfill__title">Nobody else is here yet.</p>
      <p className="cc-muted">
        Fight a bot while you wait. If a player arrives, they take its place.
      </p>
      <div className="cc-row">
        {TIERS.map(({ tier, label }) => (
          <Button
            key={tier}
            size="sm"
            variant={tier === "normal" ? "primary" : "secondary"}
            disabled={asked}
            onClick={() => {
              setAsked(true);
              client.requestBackfillBot(tier);
            }}
          >
            {label} bot
          </Button>
        ))}
      </div>
    </section>
  );
}

/** A short notice when a player joined and the bot the lone player asked for stepped aside. */
export function BotDroppedNotice({ client }: { client: GameClient }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => client.subscribeBotDropped(setName), [client]);

  useEffect(() => {
    if (!name) {
      return;
    }
    const timer = setTimeout(() => setName(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [name]);

  if (!name) {
    return null;
  }

  return (
    <div data-testid="bot-dropped-notice" className="cc-toast" role="status">
      A player joined, so {name} stepped aside.
    </div>
  );
}
