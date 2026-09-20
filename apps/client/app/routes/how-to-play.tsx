import {
  DRAFT_TICKS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUNDS_TO_WIN,
  TICK_RATE,
} from "@castle-clash/shared";
import { Link } from "react-router";
import { CONTROLS } from "../content/controls.js";
import { pageMeta } from "../meta.js";
import { ButtonLink } from "../ui/kit/index.js";
import { ProsePage } from "../ui/ProsePage.js";

export const meta = () =>
  pageMeta({
    title: "How to play",
    path: "/how-to-play",
    description:
      "Learn Castle Clash: the controls, how combat and stamina work, the power-up draft, and how to host a private room.",
  });

export default function HowToPlay() {
  return (
    <ProsePage title="How to play">
      <p>
        Castle Clash is a duel of nerve and timing. {MIN_PLAYERS} to {MAX_PLAYERS} knights share one
        arena, or you can practice against bots. Knock the others out, win {ROUNDS_TO_WIN} rounds,
        and the match is yours.
      </p>

      <h2>Controls</h2>
      <dl className="cc-keys">
        {CONTROLS.map(({ keys, action }) => (
          <div key={action} className="cc-keys__row">
            <dt>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <p>
        The arrow keys move and jump as well. On a phone or tablet the touch controls appear on
        their own: turn it to landscape. New here? Try the{" "}
        <Link to="/play/new?mode=tutorial&next=%2Fhow-to-play">tutorial</Link>, a training dummy and
        a short list of things to try.
      </p>

      <h2>Fighting</h2>
      <ul>
        <li>
          <strong>Light</strong> attacks are quick and can be chained. <strong>Heavy</strong>{" "}
          attacks are slower, hit harder and knock foes further, but leave you open if they miss.
        </li>
        <li>
          Swinging and blocking spend <strong>stamina</strong>. Block a hit and it drains your
          stamina instead of your health, and if your stamina runs out your guard breaks.
        </li>
        <li>
          <strong>Dodge</strong> to slip out of trouble, and mind the edges: a fall into a deadly
          drop knocks you out on the spot, and the last knight to hit you gets the credit.
        </li>
      </ul>

      <h2>The power-up draft</h2>
      <p>
        After each round every player is offered three power-ups and picks one. You have{" "}
        {Math.round(DRAFT_TICKS / TICK_RATE)} seconds; if you don't choose, one is picked for you.
        Power-ups stack across the match and you can see what everyone else took.
      </p>

      <h2>Arenas and hazards</h2>
      <p>
        Every arena is a different shape and carries its own hazards: fire that flickers on and off,
        floors that break, platforms that fall away once you stand on them, and traps that telegraph
        before they strike. Quick play picks an arena at random. See them all on the{" "}
        <Link to="/">home page</Link>.
      </p>

      <h2>Playing alone</h2>
      <p>
        You never have to wait for anyone. Choose <strong>Practice</strong> in the lobby to fight 1
        to 3 bots at a difficulty you pick, on any arena. If you are alone in quick play, the game
        offers you a bot after a few seconds, and only if you say yes; when another player shows up
        they take its place. Nothing you do against bots is recorded: no stats, no leaderboard, no
        unlocks.
      </p>

      <h2>Sudden death</h2>
      <p>
        A round that runs past a minute goes to sudden death: every hit lands harder and harder, and
        everyone slowly bleeds, so a stand-off always ends. The knight with more health left
        outlasts the other.
      </p>

      <h2>Playing with friends</h2>
      <p>
        From the lobby, create a private room. You can choose its arena, and it gets a six-character
        code. Share the code, and friends enter it under "Join by code" to land in your room.
      </p>

      <h2>Your loadout</h2>
      <p>
        Pick a weapon (sword, mace or spear) and choose colours for your knight on the loadout page.
        Helmets, capes and weapon styles unlock as you play.
      </p>

      <div className="cc-row">
        <ButtonLink to="/lobby" variant="primary">
          Play
        </ButtonLink>
      </div>
    </ProsePage>
  );
}
