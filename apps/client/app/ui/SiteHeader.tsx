import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { useSession } from "../auth/useSession.js";
import { Brand } from "./Brand.js";
import { ButtonLink, Nav, type NavItem } from "./kit/index.js";

// Only signed-in visitors need the menu (and its modal and hooks), and the landing page's LCP budget
// has ~30 ms of headroom, so it loads after the session is known rather than in every page's bundle.
const AccountMenu = lazy(() =>
  import("./AccountMenu.js").then((m) => ({ default: m.AccountMenu })),
);

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
          {session && (
            <Suspense fallback={null}>
              <AccountMenu session={session} />
            </Suspense>
          )}
        </div>
      </div>
    </header>
  );
}
