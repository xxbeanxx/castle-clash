import { ARENA_IDS, type ArenaId } from "@castle-clash/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { requireSession } from "../auth/requireSession.js";
import { ARENA_LABELS } from "../content/arenas.js";
import { privatePageMeta } from "../meta.js";
import { Button, Field, Input, Panel, Select } from "../ui/kit/index.js";

const ARENA_OPTIONS = Object.values(ARENA_IDS) as ArenaId[];
/** Matches `MatchRoomOptions.arenaId`'s own "random" behavior — an empty
 *  selection means "let the server pick," not a seventh named arena. */
const RANDOM_ARENA = "";

/** Where a player goes when they are not about to fight: each is a first-class page. */
const DESTINATIONS = [
  { to: "/loadout", title: "Loadout", blurb: "Weapon, colours, helmet and cape." },
  { to: "/stats", title: "Stats", blurb: "Your record and recent matches." },
  { to: "/leaderboard", title: "Leaderboard", blurb: "See who tops the board." },
] as const;

export const meta = () => privatePageMeta("Play");

export async function clientLoader({ request }: { request: Request }): Promise<null> {
  await requireSession(request);
  return null;
}

/**
 * The Play hub: quick play, create-a-private-room, or join-by-code (plan Phase
 * 5 step 4), then the pages around a match. None of the three connect to
 * Colyseus themselves. They just navigate to `/play/new?...`, which
 * `GameCanvas`/`resolveJoinIntent` turns into the actual
 * `joinOrCreate`/`create`/`join` call once mounted, then replaces the URL with
 * the room's real id. Quick play skips the arena picker entirely and takes
 * `MatchRoom`'s random default, since there's no host to ask; only a private
 * room's creator picks one.
 */
export default function Lobby() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [arena, setArena] = useState<string>(RANDOM_ARENA);

  return (
    <div className="cc-page cc-page--hub">
      <h1>Choose your battle</h1>

      <div className="cc-hub">
        <Panel title="Jump in" className="cc-hub__quick">
          <p className="cc-muted">Join the next open match. The arena is picked at random.</p>
          <div>
            <Button variant="primary" size="lg" onClick={() => navigate("/play/new")}>
              Quick play
            </Button>
          </div>
        </Panel>

        <Panel title="Play with friends">
          <p className="cc-muted">Create a room, then share its code so friends can join you.</p>
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
          <div>
            <Button
              onClick={() => {
                const arenaParam =
                  arena === RANDOM_ARENA ? "" : `&arena=${encodeURIComponent(arena)}`;
                navigate(`/play/new?mode=private${arenaParam}`);
              }}
            >
              Create private room
            </Button>
          </div>
        </Panel>

        <Panel title="Have a code?">
          <form
            className="cc-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = code.trim();
              if (trimmed) {
                navigate(`/play/new?mode=private&code=${encodeURIComponent(trimmed)}`);
              }
            }}
          >
            <Field label="Room code" hint="Ask the host for their six-character code.">
              {(props) => (
                <Input
                  {...props}
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  maxLength={6}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              )}
            </Field>
            <div>
              <Button type="submit">Join</Button>
            </div>
          </form>
        </Panel>
      </div>

      <nav aria-label="Your knight">
        <ul className="cc-tiles">
          {DESTINATIONS.map(({ to, title, blurb }) => (
            <li key={to}>
              <Link to={to} className="cc-tile">
                <span className="cc-tile__title">{title}</span>
                <span className="cc-tile__blurb">{blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
