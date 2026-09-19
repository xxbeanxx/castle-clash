import { MATCH_ROOM_NAME, MESSAGE_TYPES, MatchState } from "@castle-clash/shared";
import { Client } from "@colyseus/sdk";
import { runDeploySmoke } from "./deploySmoke.js";

const STATE_TIMEOUT_MS = 10_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

/** A private room, not `joinOrCreate` quick play: a smoke user must never be
 *  matched into a real player's public room. */
async function joinAndLeave(gameServerUrl: string, accessToken: string): Promise<void> {
  const client = new Client(gameServerUrl);
  client.auth.token = accessToken;
  const room = await client.create<MatchState>(MATCH_ROOM_NAME, { mode: "private" }, MatchState);
  // A private room announces its join code on connect; nobody needs it here,
  // but an unhandled message type makes the SDK warn.
  room.onMessage(MESSAGE_TYPES.MATCH_CODE, () => {});
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`no state arrived from ${gameServerUrl} in ${STATE_TIMEOUT_MS} ms`)),
      STATE_TIMEOUT_MS,
    );
    room.onStateChange.once(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await room.leave();
}

async function main(): Promise<void> {
  const results = await runDeploySmoke({
    gameServerUrl: required("GAME_SERVER_URL"),
    clientUrl: required("CLIENT_URL").replace(/\/$/, ""),
    supabaseUrl: required("SUPABASE_URL"),
    supabasePublishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
    smokeToken: required("SMOKE_TOKEN"),
    expectedVersion: process.env["EXPECTED_VERSION"] || undefined,
    joinAndLeave,
    attempts: Number(process.env["SMOKE_ATTEMPTS"] ?? 30),
    retryDelayMs: Number(process.env["SMOKE_RETRY_DELAY_MS"] ?? 2000),
  });
  for (const result of results) {
    console.log(`ok   ${result.name}`);
  }
  console.log(`deploy-smoke: ${results.length} checks passed`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
