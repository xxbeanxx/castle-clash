import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ConnectionState, GameClient } from "../game/GameClient.js";

/** "Reconnecting…" while the SDK retries a dropped socket (a backgrounded phone tab is the usual
 *  cause), and a way out if it gives up. Renders nothing while connected. */
export function ConnectionOverlay({ client }: { client: GameClient }) {
  const [state, setState] = useState<ConnectionState>("connected");

  useEffect(() => client.subscribeConnection(setState), [client]);

  if (state === "connected") {
    return null;
  }
  return (
    <div
      className="cc-connection"
      role="status"
      aria-live="polite"
      data-testid="connection-overlay"
    >
      {state === "reconnecting" ? (
        <p>Reconnecting…</p>
      ) : (
        <>
          <p>Connection lost.</p>
          <Link to="/lobby" className="cc-connection__link">
            Back to the lobby
          </Link>
        </>
      )}
    </div>
  );
}
