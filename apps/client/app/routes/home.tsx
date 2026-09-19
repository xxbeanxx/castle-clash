import {
  ALL_ARENAS,
  ARENAS,
  ARENA_IDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUNDS_TO_WIN,
} from "@castle-clash/shared";
import { Link } from "react-router";
import { useServerStats } from "../api/serverStats.js";
import { arenaLabel, hazardSummary } from "../content/arenas.js";
import { CONTROLS } from "../content/controls.js";
import { weaponFacts } from "../content/weapons.js";
import { pageMeta } from "../meta.js";
import { ArenaPreview } from "../ui/ArenaPreview.js";
import { ButtonLink } from "../ui/kit/index.js";
import { LeaderboardTeaser } from "../ui/LeaderboardTeaser.js";
import { PlayNowButton } from "../ui/PlayNowButton.js";

/** The hero's backdrop: the arena with the most going on in it. */
const HERO_ARENA = ARENAS[ARENA_IDS.CASTLE_ROOM];

export const meta = () => pageMeta({ path: "/" });

const MAX_REACH = Math.max(...weaponFacts().map(({ def }) => def.reach));
const MAX_HEAVY = Math.max(...weaponFacts().map(({ def }) => def.heavy.damage));

function OnlineNow() {
  const stats = useServerStats();
  if (!stats || stats.players < 1) {
    return null;
  }
  return (
    <p className="cc-online">
      <span className="cc-online__dot" aria-hidden="true" />
      {stats.players} {stats.players === 1 ? "knight" : "knights"} in the arena now
    </p>
  );
}

export default function Home() {
  return (
    <>
      <section className="cc-hero" aria-labelledby="hero-heading">
        <div className="cc-hero__art" aria-hidden="true">
          <ArenaPreview arena={HERO_ARENA} showKnights />
        </div>
        <div className="cc-hero__copy">
          <h1 id="hero-heading" className="cc-hero__title">
            Last knight standing takes the castle.
          </h1>
          <p className="cc-hero__lede">
            A fast 2D arena brawler for {MIN_PLAYERS} to {MAX_PLAYERS} players. Swing steel, draft a
            power-up between rounds, and win {ROUNDS_TO_WIN} rounds to take the match. It runs in
            your browser: no download, no account.
          </p>
          <div className="cc-hero__actions">
            <PlayNowButton />
            <ButtonLink to="/login" size="lg" variant="ghost">
              Sign in
            </ButtonLink>
          </div>
          <OnlineNow />
        </div>
      </section>

      <div className="cc-page cc-landing">
        <section className="cc-section" aria-labelledby="how-heading">
          <h2 id="how-heading">How a match plays</h2>
          <ol className="cc-beats">
            <li>
              <h3>Fight</h3>
              <p>
                Light strikes, heavy blows, blocking and dodging. Every swing and block spends
                stamina, and a guard that runs dry breaks, leaving you open.
              </p>
            </li>
            <li>
              <h3>Draft</h3>
              <p>
                After each round, pick one of three power-ups. They stack, so a match becomes a
                build, and you can see what your rivals chose.
              </p>
            </li>
            <li>
              <h3>Win rounds</h3>
              <p>
                First to {ROUNDS_TO_WIN} rounds takes the match. Every arena carries hazards that
                punish standing still.
              </p>
            </li>
          </ol>
        </section>

        <section className="cc-section" aria-labelledby="controls-heading">
          <h2 id="controls-heading">Controls</h2>
          <div className="cc-controls">
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
            <p className="cc-muted">
              Arrow keys work too. Touch controls for phones and tablets are on the way; for now,
              play on a keyboard. <Link to="/how-to-play">Full guide</Link>
            </p>
          </div>
        </section>

        <section className="cc-section" aria-labelledby="arenas-heading">
          <h2 id="arenas-heading">{ALL_ARENAS.length} arenas</h2>
          <ul className="cc-arenas">
            {ALL_ARENAS.map((arena) => {
              const hazards = hazardSummary(arena);
              return (
                <li key={arena.id} className="cc-arena-card">
                  <ArenaPreview arena={arena} />
                  <h3>{arenaLabel(arena.id)}</h3>
                  <p className="cc-muted">
                    {hazards.length > 0 ? hazards.join(" · ") : "No hazards"}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="cc-section" aria-labelledby="weapons-heading">
          <h2 id="weapons-heading">Choose your weapon</h2>
          <ul className="cc-weapons">
            {weaponFacts().map(({ id, label, trait, def }) => (
              <li key={id} className="cc-weapon">
                <h3>{label}</h3>
                <p>{trait}</p>
                <dl className="cc-meters">
                  <div>
                    <dt>Reach</dt>
                    <dd>
                      <meter
                        min={0}
                        max={MAX_REACH}
                        value={def.reach}
                        aria-label={`${label} reach`}
                      >
                        {def.reach}
                      </meter>
                    </dd>
                  </div>
                  <div>
                    <dt>Heavy damage</dt>
                    <dd>
                      <meter
                        min={0}
                        max={MAX_HEAVY}
                        value={def.heavy.damage}
                        aria-label={`${label} heavy damage`}
                      >
                        {def.heavy.damage}
                      </meter>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <LeaderboardTeaser />

        <section className="cc-finale" aria-labelledby="finale-heading">
          <h2 id="finale-heading">The gate is open.</h2>
          <PlayNowButton>Play now</PlayNowButton>
        </section>
      </div>
    </>
  );
}
