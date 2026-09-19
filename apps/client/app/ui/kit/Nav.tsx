import { NavLink } from "react-router";

export interface NavItem {
  to: string;
  label: string;
  /** Match the path exactly, so `/` isn't "current" on every page. */
  end?: boolean;
}

/** A labelled list of links; the current route gets `aria-current="page"` from `NavLink`. */
export function Nav({ label, items }: { label: string; items: readonly NavItem[] }) {
  return (
    <nav aria-label={label}>
      <ul className="cc-nav">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className="cc-nav__link">
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
