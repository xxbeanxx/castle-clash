import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createTokenVerifier, type TokenVerifier } from "./verifyToken.js";

const ISSUER = "https://test-project.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const KID = "test-key";

interface SignOptions {
  sub?: string;
  iss?: string;
  aud?: string;
  isAnonymous?: boolean;
  /** Seconds from now the token expires — negative produces an already-expired token. */
  expiresInSeconds?: number;
}

function tamperSignature(token: string): string {
  const [header, payload, signature] = token.split(".");
  // Flip the FIRST base64url char, not the last: an RSA signature's length
  // isn't a multiple of 3 bytes, so its trailing char's low bits are
  // unused padding — some byte pairs (e.g. "a"/"b") decode identically
  // there, which silently defeated an earlier version of this tamper. The
  // first char is always inside a full 4-char/3-byte group, so flipping it
  // is guaranteed to change a real signature byte.
  const flippedFirstChar = signature!.startsWith("a") ? "b" : "a";
  return `${header}.${payload}.${flippedFirstChar}${signature!.slice(1)}`;
}

describe("createTokenVerifier", () => {
  let verify: TokenVerifier;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

  beforeAll(async () => {
    const { privateKey: priv, publicKey } = await generateKeyPair("RS256");
    privateKey = priv;
    const jwk = await exportJWK(publicKey);
    const jwks = { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] };

    // The plan's "injected fetcher" — jose's `[customFetch]` hook accepts
    // any function matching `fetch`'s shape, so this test never opens a
    // real port: it just hands back an in-memory JWKS `Response` for the
    // one URL `createRemoteJWKSet` will ask for.
    const fetchFn = (async (url: string | URL) => {
      if (url.toString() !== JWKS_URL) {
        throw new Error(`unexpected JWKS fetch url: ${url}`);
      }
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    verify = createTokenVerifier({ jwksUrl: JWKS_URL, issuer: ISSUER, audience: AUDIENCE, fetchFn });
  });

  async function sign(options: SignOptions = {}): Promise<string> {
    const { sub = "user-1", iss = ISSUER, aud = AUDIENCE, isAnonymous, expiresInSeconds = 3600 } = options;
    return new SignJWT({ is_anonymous: isAnonymous })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setSubject(sub)
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
      .sign(privateKey);
  }

  it("verifies a valid token and extracts userId/isAnonymous", async () => {
    const token = await sign({ sub: "user-42", isAnonymous: true });
    await expect(verify(token)).resolves.toEqual({ userId: "user-42", isAnonymous: true });
  });

  it("defaults isAnonymous to false when the claim is absent", async () => {
    const token = await sign({ sub: "user-7" });
    await expect(verify(token)).resolves.toEqual({ userId: "user-7", isAnonymous: false });
  });

  it("rejects a missing token", async () => {
    await expect(verify(undefined)).rejects.toThrow("missing auth token");
  });

  it("rejects an expired token", async () => {
    const token = await sign({ expiresInSeconds: -3600 });
    await expect(verify(token)).rejects.toThrow();
  });

  it("rejects a token with the wrong issuer", async () => {
    const token = await sign({ iss: "https://not-us.supabase.co/auth/v1" });
    await expect(verify(token)).rejects.toThrow();
  });

  it("rejects a token with the wrong audience", async () => {
    const token = await sign({ aud: "anon" });
    await expect(verify(token)).rejects.toThrow();
  });

  it("rejects a tampered signature", async () => {
    const token = tamperSignature(await sign());
    await expect(verify(token)).rejects.toThrow();
  });
});
