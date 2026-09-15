import { MatchState } from "@castle-clash/shared";
import { Client } from "@colyseus/sdk";

const STATE_TIMEOUT_MS = 5000;

async function main(): Promise<void> {
  const url = process.env.GAME_SERVER_URL ?? "ws://localhost:2567";
  const client = new Client(url);
  const room = await client.joinOrCreate<MatchState>("match", undefined, MatchState);

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
