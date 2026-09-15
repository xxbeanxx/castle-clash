# Phase 3 Colyseus Input/Prediction API Check

Research date: 2026-09-14. Scope: before implementing Phase 3's `InputQueue`, tick loop, and client
`Reconciler`/`Interpolator`, check what the _installed_ `@colyseus/core@0.18.13` /
`@colyseus/sdk@0.18.2` actually ship, per this repo's established practice (see
`phase1-version-assumptions.md` items 10–11) of reading the installed package's own `.d.ts` as a
primary source rather than assuming from general Colyseus knowledge.

## 1. `Room.setFixedTimestep` exists and supersedes `setTimestep` for deterministic sim

**Prior finding** (`phase1-version-assumptions.md` item 10): `setFixedTimestep(step, tickRate?,
opts?)` is a framework-owned accumulator loop that hands a `StepContext` (`dt`/`dtMs`/`tick`/
`subSteps`/`subDt`, fixed seconds per step, never measured wall-clock) to the callback, flagged as
"relevant groundwork for Phase 3's `GameSimulation.step()`."

**Action taken this phase:** `IntervalTickDriver` now calls `room.setFixedTimestep(cb, tickRateHz)`
instead of `setTimestep`. This matters for determinism: `setTimestep` hands the _measured_ delta
(jittery), which is exactly what `GameSimulation.step()` must never see (ADR 0001 / the plan's
`determinism.test.ts` requires the same seed+inputs to hash identically). `TickDriver`'s callback
shape changed from `(deltaMs: number) => void` to `(step: { dt: number; tick: number }) => void`
(seconds, matching `StepContext.dt`) so `ManualTickDriver` in tests can drive the exact same shape
without a real Room.

**Source:** `node_modules/@colyseus/core/build/Room.d.ts` (installed package, read directly),
lines documenting `setFixedTimestep`/`StepContext`, checked 2026-09-14.

## 2. A full built-in input-buffering + client-prediction/rollback framework exists — evaluated, not adopted this phase

**Finding:** The installed packages ship far more than the plan's prose assumes:

- **Server** (`@colyseus/core`): `Room.defineInput(SchemaCtor, opts)` returns an `InputAPI` — a
  per-client ring buffer (`bufferMaxSize`, oldest-drops-on-overflow), `seqField`-based dedupe
  (drops `seq <= lastSeen` before it enters the buffer), and a declarative `idle` policy (a
  callback returning synthesized-frame overrides when a tick has no buffered input — the same
  problem the plan's InputQueue spec describes as "repeat last frame up to 6 ticks, then neutral").
  It also cascades `tickRate`/`subSteps` to clients via the join handshake.
- **Client** (`@colyseus/sdk`): `Room.input({ type, mode })` returns an `InputHandle` (mutate
  `.data`, call `.send()`; delta-encoded, tracks `sentCount`/`lastProcessed`/`pendingCount`, buffers
  sent inputs for replay via `.at(seq)`). Layered on top, `predict.reconciler(self, …)` /
  `predict.sim(…)` (`build/predict/{Predictor,reconciler,simReconciler,rollback,divergence,
drift}.d.ts`) implement full server-reconciled rollback (apply-now, rewind-to-server-truth,
  replay-pending, smooth-correct) and `Predict`/`predict.value()` implement passive
  lerp/dead-reckoning smoothing for remote entities — i.e., a drop-in replacement for hand-written
  `Reconciler.ts`/`Interpolator.ts`.

**Was this evaluated for adoption?** Yes. It is a well-designed, more complete system than what the
plan describes, and is worth a serious look in a later phase. It was **not adopted for Phase 3**,
for two concrete reasons, not general caution:

1. **Wire coupling.** `defineInput`'s server-side buffer and the client's `room.input()`/
   `InputHandle` are two ends of one negotiated wire protocol (schema reflected through the join
   handshake, delta-encoded). Adopting one side without the other doesn't work — a client sending
   raw `room.send("input", frame)` messages (as Phase 2 already does for other messages, and as the
   plan's `MatchRoom`/`InputQueue` steps assume) never reaches a server `defineInput()` buffer.
   Adopting it is an all-or-nothing swap of the _whole_ netcode stack, not an incremental one.
2. **Behavioral fit is unverified against the plan's exact thresholds.** The plan's testing
   strategy pins specific numbers this phase must satisfy — buffer depth exactly 8, repeat-last-then-
   neutral at exactly 6 ticks, reconciliation error smoothed under 4 px over 100 ms but snapped
   above it, remote interpolation exactly 100 ms behind server time with no extrapolation. The
   built-in `Predict`/reconciler family almost certainly supports equivalent behavior through its
   own configuration surface, but confirming that requires reading and testing `rollback.d.ts`/
   `divergence.d.ts`/`drift.d.ts`/`confirmOn.d.ts` in full (unread as of this note) — a scope large
   enough on its own to risk a half-integrated result this phase, which CLAUDE.md's project
   standards rule out ("No half-finished implementations").

**Decision:** Phase 3 implements the plan's literal architecture — hand-rolled `InputQueue`
(server), `Reconciler`/`Interpolator` (client), moving `InputFrame`s over the existing plain
`room.send`/`onMessage` channel from Phase 2, with `GameSimulation.step()` as the single pure
function both sides call (ADR 0001). `setFixedTimestep` is adopted (item 1) since it's a narrow,
low-risk correctness improvement already flagged in Phase 1 research, not a new subsystem. Revisit
`defineInput`/`predict.*` in a future phase once there's a working, tested baseline to compare
against and time to read the remaining `predict/*` modules in full.

**Sources:** `node_modules/@colyseus/core/build/input/types.d.ts` (`InputAPI`, `InputAccessor`,
`DefineInputOptions`, `IdleInput`), `node_modules/@colyseus/sdk/build/input/InputHandle.d.ts`,
`node_modules/@colyseus/sdk/build/predict/Predictor.d.ts` (module doc comment enumerating the
`predict.*` family) — all installed packages' own `.d.ts`, read directly, checked 2026-09-14.
