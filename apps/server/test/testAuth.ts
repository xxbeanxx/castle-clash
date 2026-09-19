import type { ColyseusTestServer } from "@colyseus/testing";
import { MatchRoom } from "../src/rooms/MatchRoom.js";

/**
 * Test-only stand-in for real Supabase JWT verification (`MatchRoom
 * .verifyToken`'s real implementation needs a live Supabase project's
 * JWKS — see `apps/server/src/auth/verifyToken.test.ts` for the suite that
 * actually exercises that). This treats the raw token string AS the
 * userId, so every existing `MatchRoom`/matchmaking test can pick any
 * readable string it likes ("player-1", "alice", ...) as a stable fake
 * user without generating real JWTs.
 *
 * Call once per test file, in `beforeAll` — it mutates `MatchRoom`'s
 * static field, which every room the shared `server` export creates reads.
 */
export function stubAuthForTests(): void {
  MatchRoom.verifyToken = async (token) => {
    if (!token) {
      throw new Error("missing auth token");
    }
    return { userId: token, isAnonymous: false };
  };
}

/**
 * Sets `userId` as the bearer token the *next* `colyseus.connectTo(...)` or
 * `colyseus.sdk.create/join(...)` call sends. `ColyseusTestServer` shares
 * one `sdk` instance across a whole test file, and `@colyseus/sdk`'s
 * `Client.ts` reads `this.http.authToken` synchronously when a join call is
 * made (before any `await`) — so calling this right before each connect
 * call is safe even with multiple simulated users in the same test, as
 * long as the calls aren't concurrent (every existing test already awaits
 * each connect in turn).
 */
export function connectAs(colyseus: ColyseusTestServer, userId: string): void {
  colyseus.sdk.auth.token = userId;
}
