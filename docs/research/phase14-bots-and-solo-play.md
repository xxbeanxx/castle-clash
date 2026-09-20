# Phase 14: bots, solo play, and sudden death — facts checked, decisions taken, what is unverified

Checked 2026-09-20 against the tree at `0380f61` and the installed `@colyseus/core@0.18.13`
(`build/Room.mjs`). Nothing here was run against a real browser or a real phone; the "Not verified"
list says what only a human can settle.

## Verified in the tree

| Fact                                                                                                                                                                                            | Where                                    | Consequence                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MatchRoom.#tickInner` builds `inputs[id]` for every id in `#sim.players` from `InputQueue.consume(id)`, then calls `simulationStep`. Nothing in the tick asks whether an id has a `Client`.    | `apps/server/src/rooms/MatchRoom.ts`     | A bot is a seat in `SimState.players` whose frame is pushed into `InputQueue` just before `consume`. No sim, netcode or `MatchDirector` change.                                                         |
| `advanceMatchPhase` gates on `playerCount >= MIN_PLAYERS` where `playerCount` is `connectedIds.length` (`Object.keys(sim.players)`).                                                            | `match/phase.ts`, `MatchDirector.tick`   | Bots count as players, so `MIN_PLAYERS` stays 2 and one human plus one bot starts a match. The flip side: a room that holds only bots would run a match, so the room must never outlive its last human. |
| `Room.maxClients` and `hasReachedMaxClients()` count `clients.length + reservedSeats`, never sim seats.                                                                                         | `Room.mjs:434`                           | A bot does not use a client slot. Practice sets `maxClients = 1`, which also auto-locks the room when the human joins.                                                                                  |
| `#disposeIfEmpty` disposes an `autoDispose` room when `clients.length === 0` and there are no reserved seats.                                                                                   | `Room.mjs:1350`                          | A bots-only room disposes itself when the last human leaves, without help. A dropped human holds a reserved seat for `RECONNECTION_WINDOW_SECONDS`, so the room (and its bots) survives a reconnect.    |
| `lock()` sets `locked` on the listing, and matchmaking skips locked rooms.                                                                                                                      | `Room.mjs:772`                           | A quick-play room that took a backfill bot locks itself when the round starts, so later visitors get their own room instead of spectating a bot match.                                                  |
| `#buildMatchResultRecord` calls `#requireUserId` for every id in `result.stats`, which throws for an id with no Supabase user.                                                                  | `MatchRoom.ts`                           | A room with any bot must skip the record (and unlock evaluation) entirely. This is the "excluded from persistence" rule; see the deviation below.                                                       |
| `GET /stats`'s player count comes from `matchMaker.stats.local`, which counts clients.                                                                                                          | `publicStats.ts`                         | Bots do not inflate "players online".                                                                                                                                                                   |
| `DraftService` only auto-picks at `endsAtTick` (`DRAFT_TICKS`, 15 s), and `isComplete()` needs every offered player to have a pick.                                                             | `DraftService.ts`                        | A bot that waited for the timeout would hold every draft for 15 s. Bots pick the tick their offer is generated.                                                                                         |
| `runBalanceMatch` already carries a throwaway heuristic bot (`botFrame`).                                                                                                                       | `packages/shared/src/testing/balance.ts` | It is replaced by the real bot so the nightly balance report and the game measure the same thing.                                                                                                       |
| Sudden death is a flag only: `advanceMatchPhase` sets `suddenDeath` and emits an event, nothing reads it (F13). `config/game.ts`'s comment says to thread a multiplier through `resolveCombat`. | `match/phase.ts`, `config/game.ts`       | Step 7 below.                                                                                                                                                                                           |

## Decisions (asked of the user 2026-09-20; the recommendation was taken unless noted)

- **Practice** (D4-adjacent): 1 to 3 bots, the player picks the count and one of three tiers
  (`easy`, `normal`, `hard`). _This differs from the recommendation (1 bot)_, so the draft, spawn and
  3+ player rules matter here. DraftService's placement is already 2-tier for 3+ players.
- **Backfill** (D4): an explicit offer after 8 s alone in a public quick-play room, never silent. The
  bot is dropped if a human joins during `Countdown`.
- **Sudden death**: a damage multiplier that ramps, threaded through `resolveCombat`. See the
  deviation: a multiplier alone does nothing to two players who never attack, so it is paired with a
  passive HP drain.
- **Not in this phase**: step 5 (waiting room, ready state, host controls, D5) and step 8 (spectating a
  full room). Quick play stays random-arena and private rooms stay creator-picks, so D5 is unchanged.

## Deviations from the plan's Phase 14 text

1. **Bot frames go through `InputQueue`, but only for the sake of one code path.** The plan says "into
   the same `InputQueue` a human would"; that is what is built. The bot's decision function is pure
   and lives in `packages/shared/src/bots/` (isomorphic, no I/O), not in `apps/server`, so the balance
   harness and the tests drive the exact same brain.
2. **Practice and backfill matches are never recorded at all**, rather than recorded with
   `mode = 'practice'` and skipped for `player_stats`. There is no participant row a bot could own (no
   user id), a partially recorded match would need a migration for nothing a player can see, and
   "persists nothing" is the simplest thing to test. No SQL changes, so no expand/contract step.
3. **Sudden death adds a passive HP drain** to the multiplier the plan names (rationale above). Both
   land in `step()`, not outside it, so a drain can eliminate a player in the same tick
   (`config/game.ts`'s comment explained why an outside-the-step effect cannot).
4. **The tutorial is a server room, not an offline client.** `GameClient` is welded to a Colyseus
   room. A `tutorial` room with a passive dummy bot reuses all of it; the alternative was a second
   client that runs `step()` locally with its own render wiring.

## Colyseus facts used (all from the installed source, not from docs)

`maxClients` counts clients only; `autoDispose` disposes on zero clients and zero reserved seats;
`lock()` hides a room from matchmaking; `setPrivate()` hides it from the lobby listing.

## Not verified (a human needs to)

- That the tiers _feel_ like easy, normal and hard to a person. What is measured is a win-rate order
  between tiers and a time-to-kill against a passive target, in the simulation only.
- That 8 s is the right wait before offering a bot, and that the offer is readable on a phone in
  landscape.
- That the sudden-death drain and ramp feel like pressure rather than a coin flip. The constants were
  chosen so a stalemate ends within about 20 s, by test, not by play.
- That bots make sense on all six arenas: they use no pathfinding, so a bot may run off a ledge or
  stand in a fire zone on some layout. The balance report counts unfinished matches; a human should
  watch each arena once.
- Per-tick server cost with several bot rooms. The tick histogram exists (`tickDurationSeconds`); the
  load test has not been re-run with bots.
