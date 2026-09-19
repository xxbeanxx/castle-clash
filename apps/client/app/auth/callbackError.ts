/**
 * What Supabase puts in the URL when a Google round trip fails. GoTrue redirects back with the error
 * in both the query string and the fragment (`error`, `error_code`, `error_description`); the query
 * wins when both name one. Parsed by hand rather than through supabase-js because the SDK reports
 * these from `initialize()` only, and this page needs to react to them itself
 * (`docs/research/phase12-supabase-google-oauth.md`, findings 6-8).
 */
export type CallbackErrorKind =
  /** The Google identity, or its email, already belongs to another account. */
  | "account-exists"
  /** The player backed out of Google's consent screen. */
  | "cancelled"
  | "other";

export interface CallbackError {
  readonly kind: CallbackErrorKind;
  readonly code: string | null;
  readonly description: string | null;
}

const ACCOUNT_EXISTS_CODES = new Set(["identity_already_exists", "email_exists"]);

function parse(params: string): URLSearchParams {
  return new URLSearchParams(params.replace(/^[?#]/, ""));
}

export function readCallbackError(search: string, hash: string): CallbackError | null {
  const query = parse(search);
  const fragment = parse(hash);
  const pick = (name: string): string | null => query.get(name) ?? fragment.get(name);

  const error = pick("error");
  const code = pick("error_code");
  const description = pick("error_description");
  if (!error && !code && !description) {
    return null;
  }

  let kind: CallbackErrorKind = "other";
  if (code && ACCOUNT_EXISTS_CODES.has(code)) {
    kind = "account-exists";
  } else if (error === "access_denied") {
    kind = "cancelled";
  }
  return { kind, code, description };
}
