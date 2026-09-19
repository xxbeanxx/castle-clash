import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  onAuthStateChange,
  type OAuthProvider,
  signInAsGuest,
  signInWithMagicLink,
  signInWithOAuth,
} from "../auth/supabase.js";
import { safeNextPath } from "../auth/nextPath.js";
import { Button, Field, Input, Panel } from "../ui/kit/index.js";
import { privatePageMeta } from "../meta.js";

export const meta = () => privatePageMeta("Sign in");

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
  const [searchParams] = useSearchParams();
  const destination = safeNextPath(searchParams.get("next")) ?? "/lobby";
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChange((session) => {
      if (session) {
        navigate(destination, { replace: true });
      }
    });
  }, [navigate, destination]);

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
    <div className="cc-page">
      <Panel className="cc-login">
        <h1>Sign in to Castle Clash</h1>

        <form onSubmit={handleMagicLinkSubmit} className="cc-stack">
          <Field label="Email">
            {(props) => (
              <Input
                {...props}
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" block disabled={pending || magicLinkSent}>
            {magicLinkSent ? "Check your email for a link" : "Send magic link"}
          </Button>
        </form>

        <div className="cc-divider">or</div>

        <div className="cc-stack">
          <Button block onClick={() => handleOAuth("google")} disabled={pending}>
            Continue with Google
          </Button>
          <Button block variant="ghost" onClick={handleGuest} disabled={pending}>
            Play as guest
          </Button>
        </div>

        {error && (
          <p role="alert" className="cc-alert">
            {error}
          </p>
        )}
      </Panel>
    </div>
  );
}
