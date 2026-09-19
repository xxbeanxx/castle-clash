import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { getSession, signInAsGuest } from "../auth/supabase.js";
import { Button, type ButtonSize, type ButtonVariant } from "./kit/index.js";

/**
 * One click from a cold visit into a match: reuse the current session, or start
 * a guest one, then go to quick play. No form, no typing. A failure (Supabase
 * down, guest sign-in disabled) stays on the page with a message and a retry,
 * rather than dropping a visitor on a login wall.
 */
export function PlayNowButton({
  size = "lg",
  variant = "primary",
  children = "Play now",
}: {
  size?: ButtonSize;
  variant?: ButtonVariant;
  children?: string;
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const session = await getSession();
      if (!session) {
        await signInAsGuest();
      }
      navigate("/play/new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a guest session.");
      setPending(false);
    }
  }

  return (
    <div className="cc-playnow">
      <Button variant={variant} size={size} disabled={pending} onClick={() => void handleClick()}>
        {pending ? "Entering the arena…" : children}
      </Button>
      {error && (
        <p role="alert" className="cc-alert">
          {error} <Link to="/login">Sign in another way</Link>
        </p>
      )}
    </div>
  );
}
