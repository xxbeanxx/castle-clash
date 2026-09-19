import { pageMeta } from "../meta.js";
import { ProsePage } from "../ui/ProsePage.js";
import { REPO_URL } from "../ui/SiteFooter.js";

export const meta = () =>
  pageMeta({
    title: "Privacy policy",
    path: "/privacy",
    description:
      "What Castle Clash collects, why, where it is stored, who can see it, and how to ask for it to be deleted.",
  });

export default function Privacy() {
  return (
    <ProsePage title="Privacy policy" updated="19 September 2026">
      <p>
        Castle Clash is a small browser game. This page says plainly what it collects, why, and what
        you can do about it. We collect as little as the game needs to work.
      </p>

      <h2>What we collect</h2>
      <h3>If you play as a guest</h3>
      <p>
        A random account id, created when you press Play. No name, no email. It lets the game
        remember your loadout and stats on that browser.
      </p>
      <h3>If you sign in</h3>
      <ul>
        <li>
          <strong>Email:</strong> if you sign in with an email link, we store the address to
          recognise you next time.
        </li>
        <li>
          <strong>Google or another provider:</strong> if you choose one, we receive the identifier
          and basic profile details that provider shares with us, typically your name and email
          address. We do not receive your provider password.
        </li>
      </ul>
      <h3>Your game data</h3>
      <p>
        Your display name (if you set one), your loadout and unlocked cosmetics, and the record of
        your matches: results, eliminations, deaths and damage dealt.
      </p>
      <h3>While you play</h3>
      <p>
        Your key presses are sent to the game server in real time so it can run the match. They are
        used to play the match and are not kept afterwards.
      </p>
      <h3>Technical data</h3>
      <p>
        The hosting platform keeps standard request logs (for example IP address and browser type)
        for security and operations. The game server's own logs identify a connection by a random
        session id, not by your name or email.
      </p>

      <h2>What is stored in your browser</h2>
      <p>
        Your sign-in session, so you stay signed in, kept in your browser's local storage. We do not
        use advertising or tracking cookies, and we do not run analytics on the site today. If that
        changes, this page will say so before it does.
      </p>

      <h2>What other players can see</h2>
      <p>
        The leaderboard shows the display name and match totals of players who have chosen a name.
        Guests without a name are not listed by name. Other players in your match can see your
        knight, your loadout colours and the power-ups you pick.
      </p>

      <h2>Who processes your data</h2>
      <ul>
        <li>
          <strong>Supabase</strong> hosts accounts and game records, in a database in Canada
          (ca-central-1).
        </li>
        <li>
          <strong>Microsoft Azure</strong> hosts the website and the game server, in Canada Central.
        </li>
        <li>
          <strong>Google or Discord</strong>, only if you choose to sign in with them, under their
          own privacy policies.
        </li>
      </ul>
      <p>We do not sell your data or share it for advertising.</p>

      <h2>Keeping and deleting your data</h2>
      <p>
        We keep your account and records for as long as the account exists. You can ask us to delete
        your account and everything attached to it. Open an issue on{" "}
        <a href={`${REPO_URL}/issues`} rel="noreferrer">
          the project's GitHub page
        </a>{" "}
        and leave out personal details; we will arrange a private way to confirm it is you.
      </p>

      <h2>Children</h2>
      <p>
        Castle Clash is not aimed at children under 13, and we do not knowingly collect their data.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the date at the top changes with it. Questions about it can go to
        the same GitHub page.
      </p>
    </ProsePage>
  );
}
