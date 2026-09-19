import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from "@castle-clash/shared";
import { type FormEvent, useState } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { safeNextPath } from "../auth/nextPath.js";
import { requireSession } from "../auth/requireSession.js";
import {
  getMyProfile,
  setMyDisplayName,
  signInWithGoogle,
  signOut,
  type MyProfile,
  type SetNameResult,
} from "../auth/supabase.js";
import { privatePageMeta } from "../meta.js";
import { Button, ButtonLink, Field, Input, Panel } from "../ui/kit/index.js";

export const meta = () => privatePageMeta("Your account");

export async function clientLoader({ request }: { request: Request }): Promise<MyProfile> {
  await requireSession(request);
  return getMyProfile();
}

const NAME_PROBLEMS: Readonly<Record<Exclude<SetNameResult, { ok: true }>["reason"], string>> = {
  taken: "That name is already taken. Try another.",
  too_short: `Names need at least ${DISPLAY_NAME_MIN} characters.`,
  too_long: `Names can have at most ${DISPLAY_NAME_MAX} characters.`,
  bad_characters: "Use letters, numbers, dashes and underscores only, with no spaces.",
  reserved: "You can’t use that name. Try another.",
  blocked: "You can’t use that name. Try another.",
  guest: "Guests can’t choose a name. Save your progress with Google first.",
};

/**
 * Who you are: the name other players see, whether this is a guest or a real account, and sign out.
 *
 * A guest has no name form on purpose. A name puts a player on the public leaderboard, and guests stay
 * off it until they link an account (plan decision D3, enforced by the database too), so the page
 * offers the way to become a real account instead.
 *
 * `?welcome=1&next=…` is the first-sign-in variant `/auth/callback` sends new accounts to: it invites
 * a name and never blocks play, and carries on to `next` (same-origin only) once saved or skipped.
 */
export default function Account() {
  const profile = useLoaderData<typeof clientLoader>();
  const [searchParams] = useSearchParams();
  const welcome = searchParams.get("welcome") === "1";
  const destination = safeNextPath(searchParams.get("next")) ?? "/lobby";
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
    } finally {
      navigate("/");
    }
  }

  return (
    <div className="cc-page">
      <h1>Your account</h1>
      {profile.isAnonymous ? (
        <GuestPanel />
      ) : (
        <NamePanel
          initial={profile.displayName ?? ""}
          welcome={welcome}
          onSaved={() => {
            if (welcome) {
              navigate(destination);
            }
          }}
          skipTo={destination}
        />
      )}
      <Panel title="Sign out">
        <p className="cc-muted">
          {profile.isAnonymous
            ? "Signing out as a guest leaves this progress behind."
            : "You can sign back in with the same account any time."}
        </p>
        <Button variant="ghost" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </Panel>
    </div>
  );
}

function NamePanel({
  initial,
  welcome,
  onSaved,
  skipTo,
}: {
  initial: string;
  welcome: boolean;
  onSaved: () => void;
  skipTo: string;
}) {
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setProblem(null);
    setSaved(false);
    setPending(true);
    try {
      const result = await setMyDisplayName(name);
      if (result.ok) {
        setName(result.name);
        setSaved(true);
        onSaved();
      } else {
        setProblem(NAME_PROBLEMS[result.reason]);
      }
    } catch {
      setProblem("We couldn’t save that just now. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel title="Display name">
      <p className="cc-muted">
        {welcome
          ? "Welcome! Pick a name other players will see on the results screen and the leaderboard."
          : "This is the name other players see on the results screen and the leaderboard."}
      </p>
      <form onSubmit={(event) => void handleSubmit(event)} className="cc-stack">
        <Field
          label="Display name"
          hint={`${DISPLAY_NAME_MIN} to ${DISPLAY_NAME_MAX} letters, numbers, dashes or underscores.`}
          error={problem ?? undefined}
        >
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={DISPLAY_NAME_MAX + 8}
              autoComplete="nickname"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              disabled={pending}
            />
          )}
        </Field>
        <div className="cc-row">
          <Button type="submit" variant="primary" disabled={pending}>
            Save name
          </Button>
          {welcome && (
            <ButtonLink to={skipTo} variant="ghost">
              Skip for now
            </ButtonLink>
          )}
        </div>
        {saved && <p role="status">Saved.</p>}
      </form>
    </Panel>
  );
}

function GuestPanel() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      // Comes back to this page, where the new account can pick a name.
      await signInWithGoogle("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t start Google sign-in");
      setPending(false);
    }
  }

  return (
    <Panel title="You’re playing as a guest" headingLevel={2}>
      <p>
        Save your progress by linking a Google account. You keep your stats and unlocks, and you can
        pick a name to appear on the leaderboard.
      </p>
      <p className="cc-muted">
        Without one, this progress lives only in this browser and is lost if you clear it or sign
        out.
      </p>
      <Button variant="primary" onClick={() => void handleSave()} disabled={pending}>
        Continue with Google
      </Button>
      {error && (
        <p role="alert" className="cc-alert">
          {error}
        </p>
      )}
    </Panel>
  );
}
