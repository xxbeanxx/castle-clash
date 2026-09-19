/**
 * Applies the hosted Supabase project's auth settings this game depends on
 * (Google sign-in, guest -> account linking) through the Management API, and
 * nothing else. Supabase auth config is deliberately not in Terraform (see
 * `infra/terraform/supabase.tf`), so this is how "Google is on" stops being a
 * dashboard click nobody can audit: the script states the wanted values, shows
 * the diff against the live project, and only writes with `--apply`.
 *
 * Every fact about the API here comes from
 * `docs/research/phase12-supabase-google-oauth.md` (finding numbers in
 * comments). The one thing that note could NOT verify is that PATCH leaves
 * unmentioned keys alone, so a real run checks it: after writing, it re-reads
 * the whole config and fails if any setting it did not ask to change changed.
 *
 * Pure of I/O apart from the injected `fetchFn`, like `deploySmoke.ts`.
 */

const API_BASE = "https://api.supabase.com/v1/projects";

/** The redirect URL the client's `/auth/callback` route lives at. Must be in the
 *  project's allow-list unless the client origin is already `site_url`, whose
 *  origin passes for any path (finding 11). */
export const ALLOW_LIST_ENTRY_PATH = "/auth/callback";

export type AuthConfig = Record<string, unknown>;

export interface AuthConfigInput {
  /** The client's origin, e.g. `https://play.atomic-nucleus.com`. */
  readonly clientOrigin: string;
  readonly googleClientId: string;
  /** Sent only when given. The API returns the stored secret hashed (finding 15),
   *  so it can neither be compared nor read back: omit it to leave it as is. */
  readonly googleClientSecret?: string;
}

export interface AuthConfigChange {
  readonly key: string;
  readonly from: unknown;
  readonly to: unknown;
  readonly secret: boolean;
}

export interface AuthConfigResult {
  readonly changes: readonly AuthConfigChange[];
  readonly warnings: readonly string[];
  readonly applied: boolean;
}

export interface RunAuthConfigOptions {
  readonly projectRef: string;
  /** A Supabase personal access token (`sbp_...`). */
  readonly token: string;
  readonly input: AuthConfigInput;
  readonly apply: boolean;
  readonly fetchFn?: typeof fetch;
}

const HIDDEN = "(hidden)";

function isSecretKey(key: string): boolean {
  return /secret|password/i.test(key);
}

function splitAllowList(value: unknown): string[] {
  return typeof value === "string"
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];
}

/** The settings this game owns, given what the project currently has. Anything not
 *  named here is never sent. */
export function desiredAuthConfig(input: AuthConfigInput, current: AuthConfig): AuthConfig {
  const callback = `${input.clientOrigin}${ALLOW_LIST_ENTRY_PATH}`;
  const allowList = splitAllowList(current["uri_allow_list"]);
  if (!allowList.includes(callback)) {
    allowList.push(callback);
  }

  return {
    external_google_enabled: true,
    external_google_client_id: input.googleClientId,
    ...(input.googleClientSecret ? { external_google_secret: input.googleClientSecret } : {}),
    // Both are required for `linkIdentity` on an anonymous user (finding 1).
    external_anonymous_users_enabled: true,
    security_manual_linking_enabled: true,
    // Turning this on would weaken automatic identity linking (finding 10).
    mailer_allow_unverified_email_sign_ins: false,
    uri_allow_list: allowList.join(","),
  };
}

function sameValue(key: string, a: unknown, b: unknown): boolean {
  if (key === "uri_allow_list") {
    const left = splitAllowList(a).sort();
    const right = splitAllowList(b).sort();
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffAuthConfig(current: AuthConfig, desired: AuthConfig): AuthConfigChange[] {
  const changes: AuthConfigChange[] = [];
  for (const [key, to] of Object.entries(desired)) {
    const secret = isSecretKey(key);
    // A secret is write-only: the API hands back a hash, so "differs" is unknowable.
    // Being in `desired` means the caller supplied one, so always send it.
    if (secret || !sameValue(key, current[key], to)) {
      changes.push({
        key,
        from: secret ? HIDDEN : current[key],
        to: secret ? HIDDEN : to,
        secret,
      });
    }
  }
  return changes;
}

async function request(
  fetchFn: typeof fetch,
  method: "GET" | "PATCH",
  options: RunAuthConfigOptions,
  body?: AuthConfig,
): Promise<AuthConfig> {
  const response = await fetchFn(`${API_BASE}/${options.projectRef}/config/auth`, {
    method,
    headers: {
      authorization: `Bearer ${options.token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    // Status only: the body of an auth-config response can carry settings.
    throw new Error(`${method} config/auth failed with HTTP ${response.status}`);
  }
  return (await response.json()) as AuthConfig;
}

export async function runAuthConfig(options: RunAuthConfigOptions): Promise<AuthConfigResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const before = await request(fetchFn, "GET", options);
  const desired = desiredAuthConfig(options.input, before);
  const changes = diffAuthConfig(before, desired);

  const warnings: string[] = [];
  if (typeof before["site_url"] === "string" && before["site_url"] !== options.input.clientOrigin) {
    warnings.push(
      `site_url is ${before["site_url"]}, not ${options.input.clientOrigin}. It is left alone, ` +
        `but the client origin only passes the redirect check via the allow-list entry.`,
    );
  }

  if (!options.apply || changes.length === 0) {
    return { changes, warnings, applied: false };
  }

  const patch: AuthConfig = {};
  for (const change of changes) {
    patch[change.key] = desired[change.key];
  }
  await request(fetchFn, "PATCH", options, patch);

  const after = await request(fetchFn, "GET", options);
  const problems: string[] = [];
  for (const change of changes) {
    if (!change.secret && !sameValue(change.key, after[change.key], desired[change.key])) {
      problems.push(`${change.key} did not take the requested value`);
    }
  }
  // Finding 14: partial update is undocumented, so prove it on every real run.
  for (const key of Object.keys(before)) {
    if (!(key in patch) && !isSecretKey(key) && !sameValue(key, before[key], after[key])) {
      problems.push(`${key} changed although it was not part of the update`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`auth config verification failed: ${problems.join("; ")}`);
  }

  return { changes, warnings, applied: true };
}
