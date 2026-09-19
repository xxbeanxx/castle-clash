import { Link } from "react-router";
import { useServerStats } from "../api/serverStats.js";
import { REPO_URL } from "../content/site.js";

export function SiteFooter() {
  const stats = useServerStats();
  return (
    <footer className="cc-footer">
      <div className="cc-footer__inner">
        <p className="cc-muted">Castle Clash — a knight arena brawler.</p>
        <nav aria-label="Legal and links">
          <ul className="cc-footer__links">
            <li>
              <Link to="/how-to-play">How to play</Link>
            </li>
            <li>
              <Link to="/about">About</Link>
            </li>
            <li>
              <Link to="/privacy">Privacy</Link>
            </li>
            <li>
              <Link to="/terms">Terms</Link>
            </li>
            <li>
              <a href={REPO_URL} rel="noreferrer">
                GitHub
              </a>
            </li>
            {stats && (
              <li className="cc-muted" title="Game server version">
                Server v{stats.version}
              </li>
            )}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
