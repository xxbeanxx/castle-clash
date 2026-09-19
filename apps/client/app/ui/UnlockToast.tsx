import { COSMETIC_CATALOG } from "@castle-clash/shared";
import { useEffect, useState } from "react";
import type { GameClient } from "../game/GameClient.js";

const VISIBLE_MS = 6000;

function itemName(itemId: string): string {
  return COSMETIC_CATALOG.find((item) => item.id === itemId)?.name ?? itemId;
}

/**
 * A brief toast for `GameClient.subscribeProfileUnlocks` (plan Phase 9 step
 * 3: "A profile:unlocks message notifies the player") — the only reaction
 * this phase gives the message client-side; the loadout route itself reads
 * `player_unlocks` fresh on its own next visit; this doesn't try to keep an
 * in-memory unlock list in sync with it.
 */
export function UnlockToast({ client }: { client: GameClient }) {
  const [items, setItems] = useState<readonly string[] | null>(null);

  useEffect(
    () =>
      client.subscribeProfileUnlocks((itemIds) => {
        setItems(itemIds);
      }),
    [client],
  );

  useEffect(() => {
    if (!items) {
      return;
    }
    const timer = setTimeout(() => setItems(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [items]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div data-testid="unlock-toast" className="cc-toast" role="status">
      <strong>New unlock{items.length > 1 ? "s" : ""}!</strong>
      <ul>
        {items.map((itemId) => (
          <li key={itemId}>{itemName(itemId)}</li>
        ))}
      </ul>
    </div>
  );
}
