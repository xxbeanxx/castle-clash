import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useProfile } from "../auth/useProfile.js";
import type { Session } from "../auth/supabase.js";

/**
 * The header's account area for a signed-in player: their name (or "Guest") as a button that opens
 * Loadout, Stats, Account and Sign out. A guest's first item is "Save your progress", which is the
 * always-available way to become a real account (the post-match nudge is only a reminder of it).
 *
 * A disclosure, not an ARIA `menu`: it holds ordinary links and a button, so it keeps normal Tab
 * order and needs no arrow-key handling. Escape and an outside click close it; following a link
 * closes it too.
 */
export function AccountMenu({ session }: { session: Session }) {
  const guest = session.user.is_anonymous === true;
  const profile = useProfile(guest ? null : session.user.id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleMouseDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  const name = guest ? null : (profile?.displayName ?? null);
  const label = guest ? "Guest" : (name ?? "Account");

  async function handleSignOut(): Promise<void> {
    setOpen(false);
    try {
      // Loaded on demand: keeps supabase-js off the public pages' critical path.
      const { signOut } = await import("../auth/supabase.js");
      await signOut();
    } finally {
      navigate("/");
    }
  }

  return (
    <div
      className="cc-menu"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      {/* A native button: it needs a ref for returning focus, which the kit's `Button` doesn't expose. */}
      <button
        ref={buttonRef}
        type="button"
        className="cc-btn cc-btn--ghost cc-btn--sm"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cc-menu__label">{label}</span>
        <span aria-hidden="true" className="cc-menu__caret">
          ▾
        </span>
      </button>
      {open && (
        <div id={panelId} className="cc-menu__panel">
          {guest && (
            <Link
              className="cc-menu__item cc-menu__item--accent"
              to="/account"
              onClick={() => setOpen(false)}
            >
              Save your progress
            </Link>
          )}
          <Link className="cc-menu__item" to="/loadout" onClick={() => setOpen(false)}>
            Loadout
          </Link>
          <Link className="cc-menu__item" to="/stats" onClick={() => setOpen(false)}>
            Stats
          </Link>
          {!guest && (
            <Link className="cc-menu__item" to="/account" onClick={() => setOpen(false)}>
              {profile && profile.displayName === null ? "Choose a name" : "Account"}
            </Link>
          )}
          <button type="button" className="cc-menu__item" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
