import { useState } from "react";
import { useNavigate } from "react-router";

/**
 * Quick play, create-a-private-room, or join-by-code (plan Phase 5 step 4)
 * — none of these connect to Colyseus themselves. They just navigate to
 * `/play/new?...`, which `GameCanvas`/`resolveJoinIntent` turns into the
 * actual `joinOrCreate`/`create`/`join` call once mounted, then replaces the
 * URL with the room's real id.
 */
export default function Lobby() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 320 }}>
      <h1>Castle Clash</h1>

      <button type="button" onClick={() => navigate("/play/new")}>
        Quick play
      </button>

      <button type="button" onClick={() => navigate("/play/new?mode=private")}>
        Create private room
      </button>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = code.trim();
          if (trimmed) {
            navigate(`/play/new?mode=private&code=${encodeURIComponent(trimmed)}`);
          }
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          aria-label="Room code"
          placeholder="Room code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={6}
        />
        <button type="submit">Join</button>
      </form>
    </div>
  );
}
