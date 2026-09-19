# Phase 12: Supabase Auth + Google OAuth, anonymous-to-Google linking

Written 2026-09-19. Phase 12 turns anonymous guests into Google-backed accounts. This records what was
checked in primary sources: the installed `@supabase/auth-js@2.116.0` / `@supabase/supabase-js@2.116.0`
(read in `node_modules/.pnpm`), the Supabase Auth (GoTrue) source on `main`, Supabase's docs sources and
Management API OpenAPI, the `supabase/terraform-provider-supabase` source at the locked `v1.11.0`, and
Google's own help pages. "GoTrue source" below means files under `internal/` of the Supabase Auth repo
(`github.com/supabase/auth`, branch `master`), read raw on 2026-09-19. Each finding is marked
**Verified** (read in the owner's source), **Partially** or **Could not verify**.

## A. `linkIdentity` and anonymous users

1. **Manual linking is required; the whole `/user/identities` route group is gated.** Verified.
   GoTrue `internal/api/api.go`: `r.Route("/identities", ... r.Use(api.requireManualLinkingEnabled);
   r.Get("/authorize", api.LinkIdentity); r.Delete("/{identity_id}", api.DeleteIdentity))`.
   `middleware.go`: when `Security.ManualLinkingEnabled` is false it returns 404
   `manual_linking_disabled` / "Manual linking is disabled". So `unlinkIdentity` needs it too. Docs agree:
   https://supabase.com/docs/guides/auth/auth-anonymous ("Converting an anonymous user to a permanent user
   requires linking an identity ... requires you to enable manual linking") and
   https://supabase.com/docs/guides/auth/auth-identity-linking (env `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED`;
   local `config.toml` key `auth.enable_manual_linking`, `apps/docs/spec/cli_v1_config.yaml`). Management API
   field: `security_manual_linking_enabled` (finding 12). Nothing else is documented as a prerequisite for
   anonymous linking beyond anonymous sign-ins being on (`external_anonymous_users_enabled`).
2. **`linkIdentity` semantics in the installed client.** Verified (`auth-js@2.116.0`
   `src/GoTrueClient.ts`, `linkIdentityOAuth`). It calls `GET {auth}/user/identities/authorize?provider=...
   &redirect_to=...&skip_http_redirect=true` with the session's access token as Bearer (so the user must
   already have a session, anonymous is fine), gets `{url}` back, then, in a browser and unless
   `options.skipBrowserRedirect` is true, does `window.location.assign(url)`. It returns
   `{ data: { provider, url, flowId }, error }`. The client-side pre-fetch means errors like
   `manual_linking_disabled` come back as `error` from the call itself, before any redirect. Options are
   `redirectTo`, `scopes`, `queryParams`, `skipBrowserRedirect` (same as `signInWithOAuth`).
3. **User id is preserved; `is_anonymous` flips to false, but only if the Google email is verified.**
   Verified. GoTrue `identity.go` `linkIdentityToUser` attaches the new identity to `targetUser` (the
   JWT's user, restored from the flow state's `LinkingTargetID` in `external.go`
   `loadExternalStateFromUUID`). An anonymous user has no email, so it enters the
   `if targetUser.GetEmail() == ""` branch: `UpdateUserEmailFromIdentities`; if the provider email is not
   verified it sends a confirmation mail and errors `email_not_confirmed` (identity committed, still
   anonymous); otherwise `Confirm()` then `if targetUser.IsAnonymous { IsAnonymous = false }`. Google
   marks its email verified (`provider/google.go`: `VerifiedEmail || EmailVerified`), so the normal case
   flips. The supabase docs do not spell any of this out; the source is the only owner.
4. **Return trip and what the callback page must do.** Verified. Browser goes to Google, Google to
   `https://<ref>.supabase.co/auth/v1/callback` (GoTrue `api.go` `/callback`), GoTrue then 302s to the
   stored referrer, which is `redirectTo` if it passes the allow-list (finding 11), otherwise `site_url`
   (`utilities/request.go` `GetReferrer`). Installed default is **implicit flow**: `supabase-js`
   `src/lib/constants.ts` and auth-js `DEFAULT_OPTIONS` both say `flowType: 'implicit'`, and
   `detectSessionInUrl: true`. The repo's `apps/client/app/auth/supabase.ts` calls `createClient(url, key)`
   with no auth options, so it is implicit + auto-detect. Implicit success lands with the session in the
   **URL hash** (`#access_token=...&refresh_token=...`); `_initialize()` runs when the client is
   constructed on that page, parses hash and query (`parseParametersFromURL`, query wins), saves the
   session and fires `SIGNED_IN` (not `USER_UPDATED`). No `exchangeCodeForSession` call is needed, and
   would be wrong, in implicit mode. Only under `flowType: 'pkce'` does the URL carry `?code=`; even then
   detectSessionInUrl exchanges it if a verifier is in storage; `exchangeCodeForSession(code)` is the
   manual route. The Google guide agrees ("For an implicit flow, that's all you need to do"):
   https://supabase.com/docs/guides/auth/social-login/auth-google.
5. **A page that builds the client after load must build it on the callback route.** Verified from
   `_initialize` (it only inspects `window.location` at construction / first `initialize()`); the
   `?next=` query survives the round trip (findings 6 and 11). After a successful implicit callback auth-js
   itself clears the URL hash (`window.location.hash = ''`).

## B. Collisions: the Google identity already belongs to someone else

6. **`identity_already_exists`, HTTP 422, surfaces in the callback URL, not as a `linkIdentity` error.**
   Verified. `identity.go` `linkIdentityToUser`: if `FindIdentityByIdAndProvider(sub, provider)` finds a
   row, it returns `NewUnprocessableEntityError(ErrorCodeIdentityAlreadyExists, "Identity is already
   linked to another user")` (or "Identity is already linked" when it is the same user).
   `ErrorCodeIdentityAlreadyExists = "identity_already_exists"` in `apierrors/errorcode.go`. This runs in the
   callback, after the browser has been to Google, so `linkIdentity()` has already resolved. GoTrue
   `external.go` `redirectErrors`/`getErrorQueryString` redirect to the referrer with the error in both the
   **query** and the **fragment**: params `error`, `error_code`, `error_description` (fragment also gets
   `sb=`). Concretely: `error_code=identity_already_exists`,
   `error_description=Identity is already linked to another user`, and `error=server_error` (422 is not
   in `oauthErrorMap`, which only maps 400/401/403/500/503). `redirectTo`'s own query (`next=...`) is kept
   because GoTrue starts from `u.Query()`. The docs page says errors "will be returned as query
   fragments": https://supabase.com/docs/guides/auth/redirect-urls (Error handling).
7. **How the SDK reports it.** Verified (auth-js `_getSessionFromURL`/`_initialize`). If the URL has
   `error`, `error_description` or `error_code`, `detectSessionInUrl` throws
   `AuthImplicitGrantRedirectError(error_description, { error, code: error_code })`; it is **returned by
   `await supabase.auth.initialize()`** as `{ error }` (`error.details.code === 'identity_already_exists'`),
   not delivered through `onAuthStateChange`, and the URL is left untouched. `_initialize` explicitly
   special-cases `identity_already_exists`, `identity_not_found`, `single_identity_not_deletable` and,
   like every URL error, does not drop the stored session. Simplest robust option: read
   `error_code` from `location.search`/`location.hash` yourself on the callback route.
8. **A second collision mode exists: Google email matches an existing email user.** Verified. If the
   Google identity is new but its verified email belongs to another user,
   `UpdateUserEmailFromIdentities` yields `UserEmailUniqueConflictError`, mapped in `linkIdentityToUser`
   to 400 `email_exists`, "A user with this email address has already been registered" (`errors.go`
   `DuplicateEmailMsg`); the transaction rolls back, so no identity is created. It arrives as
   `error=invalid_request&error_code=email_exists`. The anonymous-conversion docs describe the same
   situation for `updateUser({email})` ("This email belongs to an existing user. Please sign in to that
   account", then reassign data yourself): https://supabase.com/docs/guides/auth/auth-anonymous. Handle
   both codes as "sign in to the existing account instead".

## C. `signInWithOAuth` while anonymous, and automatic linking

9. **`signInWithOAuth` does not convert the guest; the guest is abandoned.** Verified.
   `/authorize` is `api.ExternalProviderRedirect` and calls `GetExternalProviderRedirectURL(w, r, nil)`: no
   linking target, so the callback runs `createAccountFromExternalIdentity` (create, auto-link by email, or
   sign into the existing user), never `linkIdentityToUser` (`external.go`). auth-js
   `_handleProviderSignIn` never reads the session. The callback issues tokens for whichever user that
   resolved to, and the client overwrites the stored anonymous session. The anonymous `auth.users` row
   remains, orphaned. Anything keyed to the guest's user id must be moved by you (docs' "Resolving
   identity conflicts", https://supabase.com/docs/guides/auth/auth-anonymous), which is the "sign in to an
   existing account" path for the game.
10. **Automatic linking by email, and caveats.** Verified.
    https://supabase.com/docs/guides/auth/auth-identity-linking: "Supabase Auth automatically links
    identities with the same email address to a single user", and "It would also be an insecure practice
    to automatically link an identity to a user with an unverified email address since that could lead to
    pre-account takeover attacks", so any *unconfirmed* identities on the existing user are removed
    when a new identity links (`RemoveUnconfirmedIdentities` in `external.go`). Code
    (`models/linking.go` `DetermineAccountLinking`): only **verified** provider emails are considered
    (or all when mailer autoconfirm is on); SSO users are excluded; providers can be split into isolated
    "linking domains" (experimental). If the provider email is unverified and
    `mailer_allow_unverified_email_sign_ins` is off, sign-in fails `provider_email_needs_verification`
    (`error=access_denied`). Caveat for this repo: turning `mailer_allow_unverified_email_sign_ins` on
    weakens that protection for providers that return unverified emails; Google returns verified ones, but
    leave it off. Signing up with email for an address that already has an OAuth account returns an
    obfuscated response with no mail (identity-linking FAQ).

## F. `redirectTo` allow-list matching

11. **Same-origin as `site_url` always passes; anything else is glob-matched against the full URL
    including the query string.** Verified. `utilities/request.go` `IsRedirectURLValid`: (1) scheme +
    hostname + port equal to `site_url` returns true for **any path or query** (port ignored for
    loopback); (2) otherwise the URL, cut at `#` only, is matched against each `uri_allow_list` entry
    compiled with `glob.MustCompile(uri, '.', '/')` (`conf/configuration.go`). Docs table of
    wildcards (`*` excludes `.` and `/`, `**` matches anything, `?` is one character):
    https://supabase.com/docs/guides/auth/redirect-urls. Consequences: an allow-list entry
    `https://host/auth/callback` does **not** match `https://host/auth/callback?next=%2Fplay...`, and a
    literal `?` in an entry is a wildcard, not a query delimiter; use `https://host/auth/callback**` (or
    rely on `site_url` being the client origin, which the repo already has). An invalid `redirectTo`
    silently falls back to the request's `Referer` if valid, then to `site_url`, with no error. The
    auth-js source says the same thing about the query string ("redirect URLs are validated against the
    project's allow list including the query string, so an extra parameter can stop exact (non-wildcard)
    entries from matching", `_maybeAppendFlowIdToRedirect`). The CLI config doc calls
    `additional_redirect_urls` "_exact_ URLs"; that is stale relative to the code above.
    A lower-risk alternative that avoids the question: stash `next` in `sessionStorage` before the
    redirect and send a bare `.../auth/callback`.

## D. Management API and Terraform

12. **Route, token, and field names.** Verified against the live OpenAPI
    (`https://api.supabase.com/api/v1-json`, fetched 2026-09-19, title "Supabase API (v1)"):
    `GET` and `PATCH /v1/projects/{ref}/config/auth` (`v1-get-auth-service-config`,
    `v1-update-auth-service-config`), `security: bearer`, OAuth scope `auth:read` / `auth:write`,
    `ref` is a 20-char `[a-z]` project ref. A personal access token goes as
    `Authorization: Bearer sbp_...` (https://supabase.com/docs/reference/api/introduction: PATs use the
    `sbp_` prefix, HTTPS only). PATCH body properties (all optional, all `nullable`, none `required`):
    `external_google_enabled`, `external_google_client_id`, `external_google_secret`,
    `external_google_additional_client_ids`, `external_google_skip_nonce_check`,
    `external_google_email_optional`, `external_discord_enabled` / `_client_id` / `_secret` /
    `_email_optional`, `external_anonymous_users_enabled`, `mailer_allow_unverified_email_sign_ins`,
    `security_manual_linking_enabled`, `disable_signup`, `site_url` (schema `^[^,]+$`, one URL),
    `uri_allow_list` (plain `string`). Both GET and PATCH return `AuthConfigResponse` (238 properties, all
    listed `required`, nullable), so a script can PATCH then compare the echoed keys. The Google
    provider's own management-API example sends `external_google_enabled`, `external_google_client_id`,
    `external_google_secret` (https://supabase.com/docs/guides/auth/social-login/auth-google).
13. **`uri_allow_list` format.** Partially. GoTrue reads it as `[]string` (`URIAllowList
    []string json:"uri_allow_list" split_words`, i.e. an env-style comma list), and a web search of the
    reference returned "comma separated list of URIs (e.g. `https://foo.example.com,https://*.foo.example.com`)".
    The OpenAPI JSON carries no description, so confirm by GET after a PATCH (item below).
14. **PATCH is a partial update: not stated in docs or OpenAPI.** Could not verify as a documented
    guarantee. Evidence for it: no property is required, and the Supabase provider's own comment "We can
    simply apply partial updates" plus its docs example patching only four auth keys
    (`terraform-provider-supabase` `docs/resources/settings.md`). Test on a scratch project: PATCH one
    key, GET before and after, diff everything else.
15. **Is the Google secret returned redacted?** Partially. The OpenAPI does not say. The Terraform
    provider docs do: "Several fields are returned as a hash by the API rather than plaintext", and list
    `external_google_secret` and `external_discord_secret` among them. So a script must **not** compare
    the secret; verify `external_google_enabled` and `external_google_client_id` and treat the secret as
    write-only.
16. **The repo's Terraform claim is wrong for the locked provider.** Verified. `infra/terraform/supabase.tf`
    says a partial `auth` block "shows a permanent diff". `.terraform.lock.hcl` locks provider
    `supabase/supabase` 1.11.0 (the latest on the registry API). At tag `v1.11.0`,
    `internal/provider/settings_resource.go` `parseConfig` -> `pickConfig` copies from the API response
    only keys present in the configured JSON, `copySensitiveFields` keeps secrets from prior state, and
    Update only PATCHes when the plan differs from state and sends just the configured keys. The docs
    say: "On import, all setting categories ... are fetched from the API. You can then selectively
    manage specific settings". Expect **one** cosmetic diff on the first plan after `terraform import`
    (state holds the full JSON, config a subset); after one apply state is the subset. That last part is
    inference from the code, not a run. Caveats: the Google secret cannot come from Google via
    Terraform (finding 21), so it must be a `sensitive` variable, and it is not drift-detected.

## E. Google Cloud side

17. **Console names (2025-2026).** Verified. The "Google Auth Platform" has Branding, Audience, Clients,
    Data Access, Verification (`console.cloud.google.com/auth/{branding,audience,clients,scopes,
    verification}`); Supabase's Google guide links to exactly those and calls the scope screen "Data Access
    (Scopes)" (https://supabase.com/docs/guides/auth/social-login/auth-google). Google's overview lists
    the same four areas (https://support.google.com/cloud/answer/15549049 family; answer 15549945 for
    Audience, 15549257 for Clients).
18. **User type and publishing status.** Verified from https://support.google.com/cloud/answer/15549945.
    External = any Google Account; Testing = up to 100 listed test users; "Authorizations by a test user
    will expire seven days from the time of consent." Under the same "Publishing status" heading: "The
    only exception ... is if your app requests a subset of ... `userinfo.email, userinfo.profile, openid`
    ... your users do not need to be in the trusted user list, they will not see a warning message, and
    their authorizations will not expire after 7 days. If your app uses Sign in with Google to
    authenticate users then this exception also applies." So for openid/email/profile only, Testing
    should not block or expire sign-in. This **contradicts** "the app must be In production" as a hard
    requirement, but I have not seen it work; treat In production as the safe target. Also: only
    Supabase sign-in uses these tokens, so refresh-token expiry does not matter to us (Supabase issues its
    own session).
19. **Verification.** Verified. https://support.google.com/cloud/answer/13463073: verification is required
    for sensitive/restricted scopes; "If your app utilizes only non-sensitive scopes, it is not mandatory
    for your app to complete the app verification process", but showing an app name and logo needs the
    lighter "brand verification". Branding page (answer 15549049): homepage, privacy policy and terms
    links plus authorized domains and developer contact are required for external production apps
    (you cannot submit for verification without the links); app name and logo show only once verified
    ("Without verification, only your application domain will be visible"); adding a logo on an external
    production app sends it through verification; user support email is a Branding field.
    Supabase says the same and adds openid must be added manually
    (https://supabase.com/docs/guides/auth/social-login/auth-google). Whether openid/email/profile are
    formally "non-sensitive" is implied by the Audience exception above, not stated in a scope table I
    could open. Not verified: whether the authorized-domain list must include the Supabase domain; Supabase's
    guide never asks for it. Test with the real console.
20. **Client and URIs.** Verified. Create a **Web application** client under Clients. Redirect URI to
    register: the project callback `https://<ref>.supabase.co/auth/v1/callback` (`http://127.0.0.1:54321/
    auth/v1/callback` locally), from the Supabase Google guide; Google requires exact match, HTTPS, no
    wildcards (https://developers.google.com/identity/protocols/oauth2/web-server). Authorized JavaScript
    origins: Supabase's guide says to add the app URL (origin only, e.g. `https://example.com`); Google's
    server-side flow doc does not mention origins, and the flow here never runs Google JS in the page, so
    they are probably unused. Add them anyway (harmless). Client secret is shown once at creation
    ("you will only be able to view and download the full client secret once"), up to two secrets can
    coexist for rotation; edits take "5 minutes to a few hours" (answer 15549257).
21. **No API or Terraform for a standard web client.** Partially verified. Google's IAP page:
    "The IAP OAuth Admin API was shut down on March 19, 2026. You can no longer create or manage OAuth
    brands or clients programmatically using this API" (https://docs.cloud.google.com/iap/docs/programmatic-oauth-clients),
    so `google_iap_client` / `google_iap_brand` are dead. `google_iam_oauth_client` /
    `iam.googleapis.com oauthClients` are Workforce Identity Federation clients that "work only with
    Identity-Aware Proxy" (https://docs.cloud.google.com/iam/docs/workforce-manage-oauth-app), not a
    consumer sign-in client. Feature request for a non-IAP resource,
    `hashicorp/terraform-provider-google#16452`, is closed; I did not confirm that no resource shipped,
    only that a registry search found none. The consent screen (Branding/Audience) has no API either.
    Client ID and secret stay a manual console step feeding the Supabase Google provider.

## Implications for the code

- Enable **manual linking** and **anonymous sign-ins** on the project; both are required for
  `linkIdentity` (finding 1). This confirms the plan.
- Callback route: keep the implicit default and do **not** call `exchangeCodeForSession`; `createClient`
  on that page detects the hash session. Handle failure by reading `error_code` from query or hash (or
  `initialize()`'s `{ error }`).
- The plan's collision code is right but incomplete: handle `identity_already_exists` **and**
  `email_exists`, from the callback URL, then offer "sign in to your existing account"
  (`signInWithOAuth`) and merge or drop the guest's data explicitly, since the guest row is orphaned.
- Use `signInWithOAuth` only for the "I already have an account" path; never for conversion.
- Carrying `next` in `redirectTo` works only if the origin equals `site_url` or an allow-list entry ends in
  `**`; an exact `/auth/callback` entry will not match. Prefer stashing `next` in `sessionStorage`.
- Config script: PATCH with the fields in finding 12, then GET and compare the non-secret fields; never
  compare `external_google_secret`. Do a PATCH-one-key-then-diff test on staging before trusting
  partial-update behaviour.
- `infra/terraform/supabase.tf`'s "permanent diff" rationale should be revisited: `supabase_settings` with
  a partial `auth` JSON is supported at v1.11.0. Whether to adopt it is a separate decision; the
  Google secret would need a `sensitive` variable.
- Google: External, Branding with homepage/privacy/terms (prerendered pages exist), authorized domain
  `atomic-nucleus.com`, developer contact, scopes openid + email + profile, publish to In production. No
  logo, so no brand verification. Client secret is a manual step.

## Summary table

| Question | Answer | Confidence |
| --- | --- | --- |
| (a) manual linking required | yes, whole `/user/identities` group (also unlink) | verified (GoTrue, docs) |
| (a) anon id / is_anonymous | same id; flips false when Google email verified | verified (GoTrue source only) |
| (a) redirect / flow | auto `location.assign` unless `skipBrowserRedirect`; implicit default; no code exchange | verified (installed auth-js) |
| (b) collision | 422 `identity_already_exists` in callback query+hash, `error=server_error`; also `email_exists` | verified (GoTrue source) |
| (c) `signInWithOAuth` as guest | new/other user, guest abandoned | verified (GoTrue source) |
| (c) auto link by email | verified emails only, unconfirmed identities removed | verified (docs + source) |
| (d) route, token, fields | PATCH/GET `config/auth`, Bearer `sbp_`, names as listed | verified (OpenAPI) |
| (d) PATCH partial | not documented | could not verify; test on staging |
| (d) secret redaction | returned hashed per provider docs | partially |
| (d) `uri_allow_list` comma list | comma-separated | partially |
| (d) TF partial block diff | provider 1.11.0 handles it; repo claim wrong | verified (provider source) |
| (e) Testing vs production | exception for openid/email/profile removes test-user cap and 7-day expiry | partially (Google text; not run) |
| (e) verification | not needed for non-sensitive scopes; logo => brand verification | verified (Google) |
| (e) redirect URI / origins | callback URL; origins per Supabase, probably unused | verified / partially |
| (e) client via API/TF | none; IAP API shut down 2026-03-19 | partially |
| (f) redirect matching | site_url origin any path; else glob incl. query, so exact entry fails | verified (GoTrue source) |

Local `supabase start` checks for the unverified rows: set `auth.enable_manual_linking = true`,
`auth.enable_anonymous_sign_ins = true`, a real Google client with `http://127.0.0.1:54321/auth/v1/callback`,
then link the same Google account from two guests to see the exact callback params, and link a Google account
whose email matches a seeded email user to see `email_exists`.

## Outcome: decision D2

Decided 2026-09-20: **Terraform owns the Supabase auth settings** (`supabase_settings.main` in
`infra/terraform/supabase.tf`), not the Management-API script this note first led to. Finding 16 is what
made that viable, and the provider's schema (read with `terraform providers schema -json`) confirms it:
`auth` is a JSON string, `external_google_secret` is preserved from prior state, and the attribute is not
itself marked sensitive, so the Google secret is passed as a `sensitive` variable, which makes the whole
value sensitive in any plan that includes it (and only then).

Two things found while writing it, both checked by evaluating the expression in an isolated config:

- A conditional between two objects of different shape (`cond ? {} : { enabled = true, id = "..." }`) is
  unified into a `map(string)`, which sent `external_google_enabled` as the **string** `"true"`. The
  configuration builds the optional keys with filtered `for` expressions instead, which keep each key's type.
- Marking is by data flow, so `var.secret != null` is itself sensitive and would have hidden the entire
  plan even when no secret was passed. `nonsensitive()` on that boolean keeps normal plans readable.

Still unverified, because nothing was applied: the first plan's exact diff after
`terraform import supabase_settings.main <ref>`, and that a later plan without the secret settles to no change.
