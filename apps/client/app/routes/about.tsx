import { Link } from "react-router";
import { pageMeta } from "../meta.js";
import { ProsePage } from "../ui/ProsePage.js";
import { REPO_URL } from "../content/site.js";

export const meta = () =>
  pageMeta({
    title: "About",
    path: "/about",
    description:
      "Castle Clash is a free browser arena brawler with a server-authoritative game and fair, predictable netcode.",
  });

export default function About() {
  return (
    <ProsePage title="About Castle Clash">
      <p>
        Castle Clash is a 2D arena brawler about armoured knights, close-quarters combat and the
        occasional deadly drop. It is free, it runs in a browser, and it is built in the open.
      </p>

      <h2>How it works</h2>
      <p>
        The game server decides everything that matters: who hit whom, who fell, who won. Your
        browser predicts your own knight so it feels immediate, then corrects itself against the
        server, so a fast connection is nice but nobody can cheat their way to a win by editing
        their own client.
      </p>
      <p>
        The rules of movement and combat are one shared piece of code that runs identically on the
        server and in your browser, which is what keeps prediction honest.
      </p>

      <h2>Where it is going</h2>
      <p>
        The game is a work in progress. The knights, arenas and hazards have pixel art now, and you
        can play alone against bots or on a phone; effects, menus and sound are still on the way.
      </p>

      <h2>Credits</h2>
      <p>
        The knight is the{" "}
        <a
          href="https://aamatniekss.itch.io/fantasy-knight-free-pixelart-animated-character"
          rel="noreferrer"
        >
          Fantasy Knight
        </a>{" "}
        by aamatniekss, recoloured for each player. Arena tiles and props come from{" "}
        <a href="https://kenney.nl/assets/tiny-dungeon" rel="noreferrer">
          Tiny Dungeon
        </a>{" "}
        by Kenney (CC0). The fire, spikes and a few more frames were drawn for this game.
      </p>

      <h2>Get involved</h2>
      <p>
        The source is on{" "}
        <a href={REPO_URL} rel="noreferrer">
          GitHub
        </a>
        , where you can report a bug or suggest something. New here? Start with{" "}
        <Link to="/how-to-play">how to play</Link>.
      </p>
    </ProsePage>
  );
}
