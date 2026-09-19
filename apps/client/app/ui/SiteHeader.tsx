import { Link, useNavigate } from "react-router";
import { useSession } from "../auth/useSession.js";
import { Brand } from "./Brand.js";
import { Button, ButtonLink, Nav, type NavItem } from "./kit/index.js";

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/lobby", label: "Play" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/how-to-play", label: "How to play" },
];

/**
 * Persistent site chrome. The account area is deliberately thin until Phase 12
 * (Google login, profile names): signed out it offers "Sign in", signed in it
 * shows who you are (guest or account) and a way out. While the session read
 * is in flight it renders nothing there, so the header never flashes the wrong
 * state.
 */
export function SiteHeader() {
  const session = useSession();
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    try {
      // Loaded on demand: keeps supabase-js off the public pages' critical path.
      const { signOut } = await import("../auth/supabase.js");
      await signOut();
    } finally {
      navigate("/");
    }
  }

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
            <>
              <span className="cc-header__who">
                {session.user.is_anonymous ? "Guest" : "Signed in"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
                Sign out
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
