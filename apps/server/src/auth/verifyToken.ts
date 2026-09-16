import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from "jose";

/** What `MatchRoom.onAuth` (and anything else authenticating a request)
 *  actually needs out of a Supabase-issued access token. `isAnonymous`
 *  mirrors Supabase's own `is_anonymous` JWT claim (set for a guest sign-in,
 *  cleared once that guest links a permanent identity) — the *same*
 *  `userId` (the token's `sub`) survives linking, so persisted stats never
 *  need migrating when a guest upgrades. */
export interface VerifiedUser {
  readonly userId: string;
  readonly isAnonymous: boolean;
}

export interface VerifyTokenOptions {
  /** A Supabase project's `.../auth/v1/.well-known/jwks.json` URL. */
  readonly jwksUrl: string;
  readonly issuer: string;
  readonly audience?: string;
  /** Only for tests: injected in place of the real `fetch` so a test can
   *  serve its own short-lived RS256/ES256 JWKS instead of reaching a real
   *  Supabase project. See {@link createTokenVerifier}'s own doc comment. */
  readonly fetchFn?: typeof fetch;
}

export type TokenVerifier = (token: string | undefined) => Promise<VerifiedUser>;

/**
 * Builds a `TokenVerifier` closed over one cached `createRemoteJWKSet`
 * resolver (jose fetches and caches the key set itself; this factory just
 * owns that cache's lifetime — call it once per process, not once per
 * verification).
 *
 * `options.fetchFn` exists purely for
 * `verifyToken.test.ts`: jose's `createRemoteJWKSet` accepts a
 * `[customFetch]` override precisely so a test can point it at a local,
 * short-lived JWKS server instead of a real network call — this factory
 * just forwards that option under its own, unexported-symbol-free name.
 */
export function createTokenVerifier(options: VerifyTokenOptions): TokenVerifier {
  const jwks = createRemoteJWKSet(
    new URL(options.jwksUrl),
    options.fetchFn ? { [customFetch]: options.fetchFn } : undefined,
  );

  return async (token: string | undefined): Promise<VerifiedUser> => {
    if (!token) {
      throw new Error("missing auth token");
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer: options.issuer,
      audience: options.audience,
    });

    return { userId: requireSub(payload), isAnonymous: payload["is_anonymous"] === true };
  };
}

function requireSub(payload: JWTPayload): string {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("token missing sub claim");
  }
  return payload.sub;
}
