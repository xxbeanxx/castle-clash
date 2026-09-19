import { Link } from "react-router";

export const REPO_URL = "https://github.com/xxbeanxx/castle-clash";

export function SiteFooter() {
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
          </ul>
        </nav>
      </div>
    </footer>
  );
}
