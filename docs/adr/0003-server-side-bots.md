# Bots are server-side seats driven by a pure shared brain, one frame per tick

A bot is a seat in `SimState.players` and a `PlayerState` with `isBot = true`. It has no `Client`,
no session and no user id. Each tick `MatchRoom` asks the bot's **brain**, a pure function in
`packages/shared/src/bots/`, for an `InputFrame` and pushes it into the same `InputQueue` a human's
frames go through, immediately before `consume`. From there the tick is unchanged: `step()` sees an
input per player and cannot tell which came from a socket.

The brain reads only the previous tick's `SimState` (never anything a human player could not see),
decides with a seeded RNG (`hashSeed(roomSeed, botId, tick)`, so there is no RNG state to carry and
a replay gives the same frames), and keeps whatever memory it needs (a short history that models
reaction delay) inside the brain object itself. It never reads a clock and never
imports Node or DOM APIs, so it lives on the isomorphic side and the balance harness, the tests and
the server all run the same code.

Consequences the rest of the system holds to:

- **Bots count toward `MIN_PLAYERS`.** A human and one bot start a match. `MIN_PLAYERS` stays 2.
- **A room's lifetime is its humans'.** Colyseus disposes a room when its last client leaves; a
  bots-only match therefore never outlives the player it was for. `maxClients` counts humans only.
- **A room with a bot writes nothing.** No `recordMatch`, no unlock evaluation, no leaderboard row:
  bots have no user id and a human-versus-bot result is not a ranked result. The `MatchResult`
  broadcast still happens so the results screen works, with the bot's name in `names`.
- **Bots draft the tick their offer exists**, from the same seeded stream as a timeout auto-pick, so
  they never hold a draft open for the 15 s fallback.
- **Bots are always announced.** `PlayerState.isBot` reaches every client and the UI says so. A
  quick-play backfill bot is only ever added by an explicit request from the lone human (decision
  D4); it is removed if a human joins during `Countdown`.

We considered running a bot as a headless `@colyseus/sdk` client, which is what the load test does
today. That would make the brain client-side (a second code path, real sockets, a real Supabase
user per bot) and a bot could not be part of a room that has no other connection. We also considered
generating bot input in `packages/shared`'s sim itself; the sim's inputs are the boundary between
"what a player decided" and "what the rules do with it", and putting a decider inside it would blur
exactly what ADR 0001 keeps separate.

The decision function is deliberately not a pathfinder. It approaches, keeps spacing, attacks,
blocks and dodges with a reaction delay and an error rate, jumps to reach a target above it and
drops through a platform to reach one below. Difficulty is those parameters and nothing else
(`easy`, `normal`, `hard`); the tests measure the ordering rather than assuming it.
