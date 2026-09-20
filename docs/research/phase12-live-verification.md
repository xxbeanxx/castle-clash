# Phase 12: live verification record

The Phase 12 gate is `docs/hosting.md`'s "Google sign-in: pre-release checklist", which needs a real
Google account and real devices, so CI cannot run it. This note records what has actually been
confirmed, and no more.

Build: production `v1.2.0`, as of 2026-09-19.

## Confirmed

- **Signing in with Google works on production.** Confirmed by the project owner, in words.

## Not individually confirmed

The owner's wording for everything else was "I believe everything works as expected". That is not a
per-step record, so these checklist items stand as **unverified**, not passed:

- Step 1: no "unverified app" wall on the consent screen (a sign-in working implies it did not block,
  but the screen itself was not inspected and recorded).
- Step 2: a guest linking Google keeps stats and unlocks.
- Step 3: both collision modes (`identity_already_exists`, `email_exists`) and the confirmation before
  switching accounts.
- Step 4: a private-room deep link surviving the Google round trip.
- Step 5: sign out returning to `/`.
- Step 6: the account menu and link prompt on a real phone.
- Step 7: display-name set, duplicate refusal, and the name on results and the leaderboard.

Until someone runs these and appends the date and any surprise here, treat the guest-upgrade and
collision paths in particular as untested against real Google: they are the ones that can orphan a
guest's progress if the assumptions in `phase12-supabase-google-oauth.md` are wrong.
