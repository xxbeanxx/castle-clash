import { MATCH_ROOM_NAME, MatchState } from "@castle-clash/shared";
import { Client } from "@colyseus/sdk";

const STATE_TIMEOUT_MS = 5000;

/** Phase 8: `MatchRoom.onAuth` rejects every join with no valid Supabase
 *  JWT, so this smoke test needs a real one — signs in anonymously via
 *  GoTrue's REST API directly (the same call `supabase-js`'s
 *  `signInAnonymously()` makes under the hood) rather than pulling in the
 *  whole `@supabase/supabase-js` client for one HTTP request. */
async function getAnonymousAccessToken(supabaseUrl: string, publishableKey: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`anonymous sign-in failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

async function main(): Promise<void> {
  const url = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set — MatchRoom.onAuth rejects an unauthenticated join.",
    );
  }

  const client = new Client(url);
  client.auth.token = await getAnonymousAccessToken(supabaseUrl, supabasePublishableKey);
  const room = await client.joinOrCreate<MatchState>(MATCH_ROOM_NAME, undefined, MatchState);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out waiting for state from ${url}`)),
      STATE_TIMEOUT_MS,
    );
    room.onStateChange.once((state) => {
      clearTimeout(timeout);
      if (state.players.size !== 1) {
        reject(new Error(`expected 1 player in state, got ${state.players.size}`));
        return;
      }
      resolve();
    });
  });

  await room.leave();
  console.log(`smoke-join: ok (joined "match" at ${url}, state arrived with 1 player)`);
}

main().catch((error: unknown) => {
  console.error("smoke-join: FAILED", error);
  process.exitCode = 1;
});
