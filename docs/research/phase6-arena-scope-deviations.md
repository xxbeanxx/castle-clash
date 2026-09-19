# Phase 6 arenas/hazards: scope deviations from the plan's prose

`docs/IMPLEMENTATION_PLAN.md`'s "Phase 6 — Arenas and Hazards" section describes
a larger surface than this session implemented. Everything below was a
deliberate scope call, made for the same kind of reason earlier phases'
deviations were (see `docs/research/phase4-knight-rendering-deviation.md`,
`docs/research/phase5-e2e-ci-deviations.md`): either the plan's own prose
already allows the simpler path, or the full version needs infrastructure
this session didn't have time to stand up and verify. None of these are
silent — each is also called out at its own code site.

## Implemented as specified

- The closed `HazardDef` union (`packages/shared/src/hazards/types.ts`) — all
  five kinds (`FireZone`, `BreakableFloor`, `KillZone`, `TimedTrap`,
  `CollapsingPlatform`), matching the plan's field list, plus one addition
  (`HazardRuntimeState.timer`, needed by `CollapsingPlatformDef`'s
  player-triggered countdown — not in the plan's `{id, kind, active, hp,
  phase}` list, same "extra field beyond the headline list" precedent
  `SimPlayer.dropThroughTicks` already set in Phase 3).
- All six arenas (`packages/shared/src/arenas/{pit,castleRoom,colosseum,
  bridge,woodenHall,dungeon}.ts`), each carrying the hazard kind(s) the
  plan's table names for it.
- The validator (`arenas/validate.ts`) and its `describe.each(ALL_ARENAS)`
  test, which additionally drops a `SimPlayer` from every spawn point for
  120 ticks of real gravity — the plan's own stated gate check.
- `MatchState.hazards: MapSchema<HazardState>` and `MatchState.arenaId` —
  static geometry (`box`, `dps`, `periodTicks`, ...) is never synced; the
  client loads it from `shared`'s arena registry by id, same as the plan's
  step 4 says.
- `Camera`'s pure framing math (`apps/client/app/game/render/Camera.ts`),
  tested per the plan's own two named assertions (two players at extremes
  → clamp-minimum zoom; one player → centers on them).

## Deliberately not implemented

1. **No `scripts/import-tiled.ts` / Tiled JSON import.** The plan's own step
   2 says "Hand-written TS is fine to start" — this isn't a deviation so
   much as taking the option the plan itself offers. All six arenas are
   hand-authored `ArenaDefinition` literals.

2. **No real arena art, no Pixi `Assets` bundles, no per-arena loading
   progress UI.** `ArenaView`/`HazardView` draw flat-tinted `Graphics`
   rectangles instead — this repo has no art assets anywhere yet, the exact
   same gap Phase 4 already hit and documented for knight rendering
   (`docs/research/phase4-knight-rendering-deviation.md`). Nothing to
   `Assets.load()`, so there's no loading state to show either.

3. **No Playwright visual-regression suite.** `client/e2e/arena-visual.spec.ts`,
   committed snapshot baselines, the `update-snapshots`-label CI job, and the
   client bundle `size-limit` check the plan's CI/CD section names are all
   unimplemented. This is real, uncovered gap relative to the plan — not an
   "the plan already allows it" case like (1) — deferred because standing up
   Playwright visual regression (baseline generation, `maxDiffPixelRatio`
   tuning, the label-triggered regeneration workflow) is its own multi-hour
   task, and this session prioritized the sim/server/client wiring the
   phase's gate actually gameplay-tests. A follow-up session should treat
   this as still owed, not as settled.

4. **Only `random` and `fixed` arena selection; no `vote`.**
   `MatchRoomOptions.arenaId` (server) and the lobby's arena `<select>`
   (client, private rooms only) cover "fixed" (an explicit pick) and
   "random" (`MatchRoom`'s default when `arenaId` is omitted/invalid, via
   `randomArenaId()`). A `vote` config — where every connected player gets
   a say — needs its own wire protocol (a vote message type, a tally phase
   before `Waiting`→`Countdown`) that doesn't exist yet and wasn't attempted.

5. **Arena rotation is per-match, not per-round.** The plan's prose says
   "arena rotation per round or match (config: random | vote | fixed)" —
   ambiguous between the two. This session picked per-match: `MatchRoom`
   picks one arena at `onCreate` and it's fixed for every round of that
   match; only hazard state (via `resetHazardState`) resets between rounds,
   not the arena itself. This matches how `respawnPlayers`
   (`MatchDirector.ts`) already treated `sim.arena` as immutable across
   rounds before this phase, and keeps `MatchState.arenaId` a
   set-once-at-`onCreate` field rather than something `MatchDirector`'s
   `roundStart` handling needs to touch.

6. **No sudden-death arena shrink.** Already out of scope before this
   phase started — see the existing comment on `ROUND_TIME_LIMIT` in
   `packages/shared/src/config/game.ts` (Phase 5), which explicitly named
   "real per-match arena geometry" (this phase's job) as the blocker and
   deferred picking it back up to "a later phase." This phase's real arena
   geometry existing now doesn't retroactively make picking this up in
   scope for it — that's still a distinct, unstarted feature.

## Environment-verification caveat carried over from Phases 4-5

`requestAnimationFrame` has been observed frozen (0 callbacks measured) in
at least two prior background-job sessions in this same dev environment,
blocking live verification of the animated gameplay loop specifically. See
this project's `feedback_verify_client_live.md` memory for the exact probe.
If it recurs in this session, Camera/ArenaView/HazardView's actual rendered
behavior (as opposed to their unit/browser-mode test coverage, which does
not depend on `requestAnimationFrame`) is only verified by that test
coverage, not by a live canvas — the session's final report says plainly
whether that held true this time.
