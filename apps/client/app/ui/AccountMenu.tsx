import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import type { Session } from "../auth/supabase.js";
import { useProfile } from "../auth/useProfile.js";
import { useSignOut } from "../auth/useSignOut.js";
import { GuestSignOutModal } from "./GuestSignOutModal.js";
import { Button } from "./kit/index.js";

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
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
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

  function handleSignOutClick(): void {
    setOpen(false);
    if (guest) {
      setConfirmingSignOut(true);
    } else {
      void signOut();
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
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cc-menu__label">{label}</span>
        <span aria-hidden="true" className="cc-menu__caret">
          ▾
        </span>
      </Button>
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
          <button type="button" className="cc-menu__item" onClick={handleSignOutClick}>
            Sign out
          </button>
        </div>
      )}
      {confirmingSignOut && (
        <GuestSignOutModal
          onCancel={() => setConfirmingSignOut(false)}
          onConfirm={() => {
            setConfirmingSignOut(false);
            void signOut();
          }}
        />
      )}
    </div>
  );
}
