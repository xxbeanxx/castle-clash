import { Link } from "react-router";
import { useSession } from "../auth/useSession.js";
import { AccountMenu } from "./AccountMenu.js";
import { Brand } from "./Brand.js";
import { ButtonLink, Nav, type NavItem } from "./kit/index.js";

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/lobby", label: "Play" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/how-to-play", label: "How to play" },
];

/**
 * Persistent site chrome. Signed out it offers "Sign in"; signed in it shows the account menu
 * (name or "Guest", with Loadout, Stats, Account and Sign out). While the session read is in flight
 * it renders nothing in that spot, so the header never flashes the wrong state.
 */
export function SiteHeader() {
  const session = useSession();

  return (
    <header className="cc-header">
      <div className="cc-header__inner">
        <Link to="/" className="cc-header__brand" aria-label="Castle Clash home">
          <Brand />
        </Link>
        <Nav label="Main" items={NAV_ITEMS} />
        <div className="cc-header__account">
          {session === null && (
            <ButtonLink to="/login" size="sm">
              Sign in
            </ButtonLink>
          )}
          {session && <AccountMenu session={session} />}
        </div>
      </div>
    </header>
  );
}
