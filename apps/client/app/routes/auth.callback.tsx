import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { readCallbackError, type CallbackError } from "../auth/callbackError.js";
import { forgetNext, peekNext } from "../auth/pendingNext.js";
import {
  getMyProfile,
  getMyStats,
  getSession,
  signInToExistingGoogleAccount,
} from "../auth/supabase.js";
import { privatePageMeta } from "../meta.js";
import { Button, ButtonLink, Modal, Panel } from "../ui/kit/index.js";

export const meta = () => privatePageMeta("Signing in");

type Outcome =
  | { readonly status: "working" }
  | { readonly status: "failed"; readonly error: CallbackError | null; readonly guest: boolean };

/**
 * Where Google (through Supabase) sends the browser back to.
 *
 * Success: supabase-js builds its client on this page, reads the session out of the URL fragment
 * (implicit flow, `detectSessionInUrl`), and `getSession()` resolves once it has. There is nothing
 * to exchange, so this must not call `exchangeCodeForSession`. The player then goes wherever
 * they were headed before Google (`pendingNext`), else the lobby.
 *
 * Failure comes back as `error` / `error_code` / `error_description` in the URL, not as a value
 * from the call that started it (`callbackError.ts`). The one that needs care is a collision: the
 * player is a guest, tried to link Google, and that Google account (or its email) already belongs
 * to someone. Their guest session is still intact, so they can keep playing, or choose to switch
 * to the other account, which leaves the guest's progress behind and therefore needs an explicit
 * confirmation.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [outcome, setOutcome] = useState<Outcome>({ status: "working" });

  useEffect(() => {
    let cancelled = false;

    async function settle(): Promise<void> {
      const error = readCallbackError(location.search, location.hash);
      let session: Awaited<ReturnType<typeof getSession>> = null;
      try {
        session = await getSession();
      } catch {
        // Treated as no session below.
      }
      if (cancelled) {
        return;
      }
      if (session && !error) {
        const destination = peekNext() ?? "/lobby";
        // A real account with no name yet is invited to pick one, on its way to where it was headed.
        // Never blocks: a failed profile read or a guest just carries on.
        let needsName = false;
        try {
          const profile = await getMyProfile();
          needsName = !profile.isAnonymous && profile.displayName === null;
        } catch {
          // Carry on to the destination.
        }
        if (cancelled) {
          return;
        }
        forgetNext();
        navigate(
          needsName ? `/account?welcome=1&next=${encodeURIComponent(destination)}` : destination,
          { replace: true },
        );
        return;
      }
      setOutcome({
        status: "failed",
        error,
        guest: session?.user.is_anonymous === true,
      });
    }

    void settle();
    return () => {
      cancelled = true;
    };
  }, [location.search, location.hash, navigate]);

  if (outcome.status === "working") {
    return (
      <div className="cc-page">
        <Panel className="cc-login">
          <p role="status">Finishing sign-in…</p>
        </Panel>
      </div>
    );
  }

  const { error, guest } = outcome;
  if (error?.kind === "account-exists") {
    return <AccountExists error={error} guest={guest} />;
  }
  return <Failed error={error} guest={guest} />;
}

function backToGame(navigate: ReturnType<typeof useNavigate>): void {
  const destination = peekNext() ?? "/lobby";
  forgetNext();
  navigate(destination, { replace: true });
}

function Failed({ error, guest }: { error: CallbackError | null; guest: boolean }) {
  const cancelled = error?.kind === "cancelled";
  return (
    <div className="cc-page">
      <Panel className="cc-login">
        <div className="cc-stack">
          <h1>{cancelled ? "Sign-in cancelled" : "Sign-in didn’t finish"}</h1>
          <p>
            {cancelled
              ? "You closed Google’s sign-in before it finished. Nothing changed."
              : (error?.description ?? "We didn’t get a signed-in session back from Google.")}
          </p>
          {guest && <p>You’re still playing as a guest, and your progress is safe.</p>}
          <div className="cc-stack">
            {guest && (
              <ButtonLink to={peekNext() ?? "/lobby"} variant="primary" block>
                Back to the game
              </ButtonLink>
            )}
            <ButtonLink to="/login" variant={guest ? "ghost" : "primary"} block>
              Try again
            </ButtonLink>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function AccountExists({ error, guest }: { error: CallbackError; guest: boolean }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [matches, setMatches] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // How much would be lost, for the confirmation. Purely informative: a failed
  // read must never stop the warning appearing, only make it less specific.
  useEffect(() => {
    if (!guest) {
      return;
    }
    let cancelled = false;
    getMyStats().then(
      (stats) => {
        if (!cancelled) {
          setMatches(stats.matchesPlayed);
        }
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [guest]);

  async function switchAccount(): Promise<void> {
    setProblem(null);
    setPending(true);
    try {
      await signInToExistingGoogleAccount(peekNext());
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Sign-in failed");
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  const explanation =
    (error.code === "email_exists"
      ? "That email address already has an account, so it can’t be added to a second one."
      : "That Google account is already linked to another player, so it can’t be added to a second one.") +
    (guest ? " We couldn’t attach your guest progress to it." : "");
  const lost =
    matches !== null && matches > 0
      ? `This guest’s ${matches} ${matches === 1 ? "match" : "matches"}, stats, unlocks and loadout`
      : "This guest’s stats, unlocks and loadout";

  return (
    <div className="cc-page">
      <Panel className="cc-login">
        <div className="cc-stack">
          <h1>You already have an account</h1>
          <p>{explanation}</p>
          {guest && (
            <p>You can keep playing as a guest, or switch to the account you already have.</p>
          )}

          <div className="cc-stack">
            {guest ? (
              <>
                <Button variant="primary" block onClick={() => backToGame(navigate)}>
                  Keep playing as guest
                </Button>
                <Button block onClick={() => setConfirming(true)} disabled={pending}>
                  Sign in to that account
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                block
                onClick={() => void switchAccount()}
                disabled={pending}
              >
                Sign in with Google
              </Button>
            )}
          </div>

          {problem && (
            <p role="alert" className="cc-alert">
              {problem}
            </p>
          )}
        </div>
      </Panel>

      {confirming && (
        <Modal
          title="Discard this guest’s progress?"
          onClose={() => setConfirming(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void switchAccount()} disabled={pending}>
                Discard guest progress and sign in
              </Button>
            </>
          }
        >
          <p>
            Signing in to your other account switches you to it. {lost} stay behind and can’t be
            brought over or recovered from this browser afterwards.
          </p>
          <p>Your other account keeps everything it already has.</p>
        </Modal>
      )}
    </div>
  );
}
