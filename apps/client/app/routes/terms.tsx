import { Link } from "react-router";
import { pageMeta } from "../meta.js";
import { ProsePage } from "../ui/ProsePage.js";

export const meta = () =>
  pageMeta({
    title: "Terms of service",
    path: "/terms",
    description:
      "The rules for playing Castle Clash: fair play, accounts, and what we can and cannot promise.",
  });

export default function Terms() {
  return (
    <ProsePage title="Terms of service" updated="19 September 2026">
      <p>
        By using Castle Clash you agree to these terms. They are short on purpose. If you do not
        agree, please do not use the game.
      </p>

      <h2>Playing fair</h2>
      <p>You agree not to:</p>
      <ul>
        <li>cheat, use bots or scripts to play for you, or exploit bugs to gain an advantage;</li>
        <li>harass, threaten or abuse other players, including through your display name;</li>
        <li>
          attack, overload or probe the game or the servers it runs on, or try to get into anyone
          else's account;
        </li>
        <li>use the game for anything unlawful.</li>
      </ul>
      <p>
        We may remove a display name, end a match, or suspend or delete an account that breaks these
        rules, without notice.
      </p>

      <h2>Accounts</h2>
      <p>
        You can play as a guest or sign in. You are responsible for what happens under your account.
        Guest accounts live in one browser: clearing your browser data can lose a guest account and
        its progress.
      </p>

      <h2>The game as it is</h2>
      <p>
        Castle Clash is provided as is, free of charge, and it is still being built. It may change,
        be interrupted or be taken offline, and progress, stats and unlocks may be adjusted or reset
        as the game develops. We do not promise it will always be available or free of bugs, and to
        the extent the law allows we are not liable for losses that come from using it.
      </p>

      <h2>Your content</h2>
      <p>
        Your display name is public. Choose one you are happy for others to see. You keep whatever
        rights you have in it, and you let us show it in the game and on the leaderboard.
      </p>

      <h2>Privacy</h2>
      <p>
        How we handle your data is explained in the <Link to="/privacy">privacy policy</Link>.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as the game changes. The date at the top shows the latest version,
        and continuing to play after a change means you accept it.
      </p>
    </ProsePage>
  );
}
