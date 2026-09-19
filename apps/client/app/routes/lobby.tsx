import { ARENA_IDS, type ArenaId } from "@castle-clash/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { requireSession } from "../auth/requireSession.js";
import { ARENA_LABELS } from "../content/arenas.js";
import { Button, ButtonLink, Field, Input, Panel, Select } from "../ui/kit/index.js";
import { privatePageMeta } from "../meta.js";

const ARENA_OPTIONS = Object.values(ARENA_IDS) as ArenaId[];
/** Matches `MatchRoomOptions.arenaId`'s own "random" behavior — an empty
 *  selection means "let the server pick," not a seventh named arena. */
const RANDOM_ARENA = "";

export const meta = () => privatePageMeta("Play");

export async function clientLoader(): Promise<null> {
  await requireSession();
  return null;
}

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
  const [arena, setArena] = useState<string>(RANDOM_ARENA);

  return (
    <div className="cc-page cc-page--narrow">
      <h1>Castle Clash</h1>

      <div className="cc-row">
        <ButtonLink to="/loadout" size="sm">
          Loadout
        </ButtonLink>
        <ButtonLink to="/stats" size="sm">
          Stats
        </ButtonLink>
        <ButtonLink to="/leaderboard" size="sm">
          Leaderboard
        </ButtonLink>
      </div>

      <Button variant="primary" size="lg" onClick={() => navigate("/play/new")}>
        Quick play
      </Button>

      <Panel>
        <Field label="Arena">
          {(props) => (
            <Select {...props} value={arena} onChange={(event) => setArena(event.target.value)}>
              <option value={RANDOM_ARENA}>Random</option>
              {ARENA_OPTIONS.map((id) => (
                <option key={id} value={id}>
                  {ARENA_LABELS[id]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button
          onClick={() => {
            const arenaParam = arena === RANDOM_ARENA ? "" : `&arena=${encodeURIComponent(arena)}`;
            navigate(`/play/new?mode=private${arenaParam}`);
          }}
        >
          Create private room
        </Button>
      </Panel>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = code.trim();
          if (trimmed) {
            navigate(`/play/new?mode=private&code=${encodeURIComponent(trimmed)}`);
          }
        }}
        className="cc-row"
      >
        <Input
          aria-label="Room code"
          placeholder="Room code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={6}
          className="cc-grow"
        />
        <Button type="submit">Join</Button>
      </form>
    </div>
  );
}
