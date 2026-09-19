import { MATCH_ROOM_NAME, MatchState, MESSAGE_TYPES, TICK_RATE } from "@castle-clash/shared";
import { sequence, hold, idle } from "@castle-clash/shared/testing";
import { Client } from "@colyseus/sdk";
import { cli, type Options } from "@colyseus/loadtest";

/**
 * Plan Phase 10 step 5's load test. Run against a locally-running server
 * (`pnpm dev`, with `SUPABASE_URL`/`SUPABASE_SECRET_KEY` set on the server and
 * `MAX_UPGRADES_PER_IP_PER_MINUTE` raised — every bot connects from one IP):
 *
 *   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... pnpm --filter server run loadtest \
 *     --endpoint ws://localhost:2567 --room match --numClients 120 --delay 50
 *
 * 120 clients fills 20 six-player rooms — the plan's target budget (tick p95
 * < 8 ms on a 2 vCPU instance). Read the server's `castle_clash_tick_duration_
 * seconds` histogram from `/metrics` while it runs; that is the number the
 * budget is about. Each bot signs in as its own anonymous Supabase user, since
 * `MatchRoom.onAuth` rejects unauthenticated joins and one user can't hold two
 * seats.
 */

const TICK_RATE_HZ = TICK_RATE;

async function anonymousAccessToken(supabaseUrl: string, publishableKey: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`anonymous sign-in failed: ${response.status} ${await response.text()}`);
  }
  return ((await response.json()) as { access_token: string }).access_token;
}

/** A repeating one-second patrol (right, jump, left, idle), phase-shifted per
 *  bot so a room's players aren't all doing the same thing on the same tick. */
function patrolScript(): ReturnType<typeof sequence> {
  return sequence(
    hold(["RIGHT"], TICK_RATE_HZ / 4),
    hold(["RIGHT", "JUMP"], TICK_RATE_HZ / 4),
    hold(["LEFT"], TICK_RATE_HZ / 4),
    idle(TICK_RATE_HZ / 4),
  );
}

async function main(options: Options): Promise<void> {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !publishableKey) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set");
  }

  const client = new Client(options.endpoint);
  client.auth.token = await anonymousAccessToken(supabaseUrl, publishableKey);
  const room = await client.joinOrCreate<MatchState>(
    options.roomName || MATCH_ROOM_NAME,
    {},
    MatchState,
  );

  const script = patrolScript();
  let tick = options.clientId % script.length;
  let seq = 0;
  const interval = setInterval(() => {
    const frame = script[tick % script.length]!;
    tick += 1;
    seq += 1;
    room.send(MESSAGE_TYPES.INPUT, { seq, bits: frame.bits });
  }, 1000 / TICK_RATE_HZ);

  room.onLeave(() => clearInterval(interval));
}

cli(main);
