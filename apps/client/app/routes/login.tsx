import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  onAuthStateChange,
  type OAuthProvider,
  signInAsGuest,
  signInWithMagicLink,
  signInWithOAuth,
} from "../auth/supabase.js";

/**
 * The one route that isn't `clientLoader`-guarded (plan Phase 8 step 6) —
 * every other guarded route redirects HERE when there's no session.
 * Signing in by any method (magic link, OAuth, guest) fires
 * `onAuthStateChange`, which is what actually navigates away — this also
 * covers a magic-link click or an OAuth provider redirecting the browser
 * straight back to this same route with a new session already attached,
 * not just this component's own button clicks.
 */
export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChange((session) => {
      if (session) {
        navigate("/lobby");
      }
    });
  }, [navigate]);

  async function withErrorHandling(action: () => Promise<void>): Promise<void> {
    setError(null);
    setPending(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void withErrorHandling(async () => {
      await signInWithMagicLink(email);
      setMagicLinkSent(true);
    });
  }

  function handleOAuth(provider: OAuthProvider): void {
    void withErrorHandling(() => signInWithOAuth(provider));
  }

  function handleGuest(): void {
    void withErrorHandling(() => signInAsGuest());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, maxWidth: 320 }}>
      <h1>Sign in to Castle Clash</h1>

      <form onSubmit={handleMagicLinkSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
        <button type="submit" disabled={pending || magicLinkSent}>
          {magicLinkSent ? "Check your email for a link" : "Send magic link"}
        </button>
      </form>

      <button type="button" onClick={() => handleOAuth("discord")} disabled={pending}>
        Continue with Discord
      </button>
      <button type="button" onClick={() => handleOAuth("google")} disabled={pending}>
        Continue with Google
      </button>

      <button type="button" onClick={handleGuest} disabled={pending}>
        Play as guest
      </button>

      {error && <p role="alert">{error}</p>}
    </div>
  );
}
