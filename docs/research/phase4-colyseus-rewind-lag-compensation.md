# Phase 4 Colyseus Rewind / Lag-Compensation API Check

Research date: 2026-09-15. Scope: before implementing Phase 4's server-authoritative hit detection,
check what the _installed_ `@colyseus/core@0.18.13` / `@colyseus/sdk@0.18.2` actually ship for
lag-compensated hit registration, per this repo's established practice (`phase1-version-assumptions
.md` items 10–11, `phase3-colyseus-input-prediction-api.md`) of reading the installed package's own
`.d.ts` as a primary source rather than trusting the plan's prose. `phase3-colyseus-input-prediction
-api.md` surfaced `allowRewindState`/`Rewind`/`lastSeenBy`/`renderTime` in passing but explicitly did
not investigate them; this note closes that gap.

**Versions** (`apps/server/package.json`: `"colyseus": "0.18"`, `"@colyseus/sdk": "0.18"`; resolved
in `pnpm-lock.yaml` to `@colyseus/core@0.18.13` / `@colyseus/sdk@0.18.2` — same versions Phase 3
checked, unchanged since).

## 1. `Rewind` is a dedicated server-side lag-compensation module, separate from `defineInput`/`predict.*`

**Finding:** `node_modules/@colyseus/core/build/Rewind.d.ts` ships a standalone class, described in
its own doc comment (lines 112–117) as "the dual of the client's `Predict`. Where `Predict`
forward-reckons entities it RECEIVES, `Rewind` records the recent positions of entities it OWNS and
rewinds field reads to a past (client render) time, so a hit test judges against where the client
actually SAW an entity."

Exact API surface (`Rewind.d.ts`, line numbers as read):

- `Room.allowRewindState(opts?: RewindOptions): Rewind` (`Room.d.ts:613`) — room method, lazily
  creates one `Rewind` per room (`Rewind.get(room, opts)`, `Rewind.d.ts:150`, keyed only by the
  `room` object identity as a cache key) and wires it to auto-record (see §2) and to the room's own
  clock (`bindNow`, `Rewind.d.ts:232`).
- `RewindOptions.maxRewindMs?: number` (`Rewind.d.ts:11–15`) — default **500 ms**; sizes the
  per-entity history ring and is also the anti-spoof/clock-skew clamp on how far back a caller can
  rewind.
- `Rewind.attachAll<E>(collection: MapSchema<E> | ArraySchema<E> | SetSchema<E>, opts:
  AttachOptions<E>): this` (`Rewind.d.ts:183`) — tracks every entity in a live Colyseus schema
  collection. `opts.fields` is a list of the element type's own numeric keys (or a per-entity fn),
  type-inferred from the collection with **zero state-type generics needed at the call site**.
  `opts.interpolate` (`"linear"` default, or `"step"` for discrete motion, `Rewind.d.ts:96-97`) and
  `opts.mode` (`"snapshot"` default or `"reckon"`, `Rewind.d.ts:98–111`, `RewindMode` type at
  `Rewind.d.ts:16–21`) are also per-attach. `Rewind.attach` (`Rewind.d.ts:185`) is the single-entity
  form (e.g. a boss).
- `Rewind.record(now: number, sampleIntervalMs?: number): void` (`Rewind.d.ts:193`) — snapshots
  every tracked entity's attached fields; `allowRewindState` calls this for you (see §2 for exactly
  when).
- `Rewind.valueAt<T>(instance: T, time: number, field: NumericKeys<T>): number` (`Rewind.d.ts:205`)
  — the low-level read: `field`'s value at past `time`, linearly interpolated (or held, for `"step"`)
  between recorded samples, falling back to the live value if the entity has no history yet.
- `Rewind.at(time: number, out?: RewindView): RewindView` (`Rewind.d.ts:258`) — sugar over
  `valueAt` for a batch of reads: clamps `time` to `[lastRecordedAt − maxRewindMs, lastRecordedAt]`
  and falls back to the newest sample when `time <= 0`. Returns a `RewindView` with `.value(entity,
  field)` and `.read(entity, fields, out?)` (`Rewind.d.ts:76–85`) — zero-alloc by default (re-aims a
  shared internal view), or pass your own `out` instance to hold more than one view at once.
- `Rewind.lastSeenBy(sessionId: string, out?: RewindView): RewindView` (`Rewind.d.ts:289`) — the
  "what you see is what you hit" convenience: resolves the render time this session's framework
  input was last stamped at and hands off to `at()`. **Requires `this.defineInput(Input)`** — see §3.

**Concrete hit-detection usage**, adapted from the shipped doc examples (`Room.d.ts:596–603`,
`Rewind.d.ts:122–132`) to this repo's actual schema (`packages/shared/src/schema/state.ts:3–23`:
`MatchState.players` is a `MapSchema<PlayerState>` with numeric `x`, `y`, `vx`, `vy`, `facing`
fields already — no schema change needed):

```ts
// in MatchRoom#onCreate:
this.rewind = this.allowRewindState({ maxRewindMs: 500 });
this.rewind.attachAll(this.state.players, { fields: ["x", "y"] });

// in a hit test, given the attacker's claimed render time:
const seen = this.rewind.at(claimedRenderTime);
const defenderX = seen.value(defenderPlayerState, "x");
const defenderY = seen.value(defenderPlayerState, "y");
// test defenderX/Y (the position the attacker actually SAW) against the attack's hurtbox
```

## 2. Auto-record cadence: the two doc comments in the shipped package disagree

**Finding:** `Rewind.d.ts`'s own class-level example (lines 122–129) says, using `setTimestep`:
"framework calls `rewind.record()` after each tick." But `Room.allowRewindState`'s doc comment on
the actual method (`Room.d.ts:590–612`) says the auto-record "fires on each **broadcast**, snapshotting
exactly what the client receives — so the rewind reproduces the client's interpolation and hits stay
exact even when the broadcast rate differs from the sim rate (`patchRate ≠ timestep`)," and offers
`rewind.record()` called manually inside a tick as the way to "take over that cadence."

These describe two different cadences (every simulation tick vs. every broadcast/patch), and the
package ships both claims without reconciling them. This repo's `MatchRoom.ts:38` sets
`this.setPatchRate(1000 / PATCH_RATE)` independently of `setFixedTimestep`'s `TICK_RATE` (per
`CLAUDE.md`'s Phase 3 section), so the two really can differ here. **Don't assume which cadence
applies without an empirical check** (or sidestep the ambiguity entirely: `Room.d.ts:610–611`
explicitly supports calling `rewind.record()` yourself, e.g. right after `projectToSchema()` in
`MatchRoom#tick()`, to pin the cadence to the sim tick rate rather than trusting the auto-record).

## 3. `lastSeenBy`/auto-`renderTime` require `defineInput()`; `Rewind`/`attachAll`/`at()` do not

**Finding — the coupled half:** `InputAccessor.renderTime`/`.reckonTime` (`input/types.d.ts:395–430`)
are documented as "populated only when the room rewinds a `mode:"snapshot"` group ... and
`bufferMaxSize > 0`" (line 401–403) — i.e. they live on the per-session accessor object that
`Room.defineInput()` returns. `RoomInput` — the class that owns the wire stamp mode, the
handshake sections, and per-client `renderTime`/`reckonTime` capture (`RoomInput.d.ts:70`
`capture(client, renderTime?, reckonTime?, seq?)`) — is, per its own class doc (`RoomInput.d.ts:6–7`):
"created lazily on the first `Room.defineInput` call — **rooms without inputs allocate none of
it**." Without `defineInput()`, there is no `RoomInput`, so there is nothing to stamp `renderTime`
at all — the shipped example in `Room.d.ts:601` even inlines this as a comment on
`rewind.lastSeenBy()`: `// needs this.defineInput(...)`.

On the client, `@colyseus/sdk`'s `InputHandle.d.ts:16–20` confirms the stamp is produced by
`room.input()` — the SDK's own negotiated input transport, paired to the server's `defineInput()`
via the join handshake's `INPUT_REFLECTION`/`INPUT_OPTIONS` sections (`RoomInput.d.ts:92–104`).
This repo's client does not use `room.input()` — `MatchRoom.ts:41–43` wires a plain
`this.onMessage(MESSAGE_TYPES.INPUT, …)` handler, and `InputQueue.ts`'s `InputFrame` is `{ seq:
number, bits: number }` (`InputQueue.ts:1–15`) — no timestamp field at all. A raw `room.send()`
input, exactly like Phase 3's finding about `defineInput`'s ring buffer, **never produces an
auto-stamped `renderTime`** because it never reaches a `RoomInput`.

**Finding — the decoupled half:** `Rewind.at(time, out?)`'s own doc (`Rewind.d.ts:250–252`)
explicitly designs for a caller-supplied timestamp as the general case: "pass the render time
yourself (e.g. from `input(sid).renderTime`, **or a value stored on the entity**). For the common
'rewind to a specific client's view' case use `lastSeenBy`." `Rewind.get(room, opts)`'s only
coupling to the `Room` is as an identity cache key (`Rewind.d.ts:150`) — no dependency on
`RoomInput`/`defineInput` internals appears anywhere in `attachAll`/`attach`/`record`/`valueAt`/`at`.

**Conclusion:** unlike Phase 3's `defineInput`/`predict.*` framework (an all-or-nothing wire-protocol
swap — see `phase3-colyseus-input-prediction-api.md` §2), `Rewind`'s recording/query engine
(`allowRewindState`, `attachAll`/`attach`, `record`, `valueAt`, `at`) is **independent of how inputs
are transported** — it operates purely on the room's own schema state history. Only the
sessionId-keyed convenience (`lastSeenBy`) and the framework's auto-stamped `renderTime`/`reckonTime`
require adopting `defineInput()` (and, on the client, `@colyseus/sdk`'s `room.input()` in place of
`room.send()`).

## 4. Recommendation: adopt `allowRewindState`/`attachAll`/`at()`; hand-roll only the timestamp field

**Adopt** `Room.allowRewindState()` + `Rewind.attachAll()` + `Rewind.at(time)`/`valueAt()` as an
incremental addition to the existing hand-rolled `InputQueue`/`MatchRoom` tick loop. **Do not**
adopt `lastSeenBy()`, `defineInput()`, or `predict.*` for this — stay on `room.send`/`onMessage`.
The one piece to hand-roll is small: add a numeric render-time field to `InputFrame` (currently
`{ seq, bits }`, `apps/server/src/rooms/InputQueue.ts:1–15`) that the attacking client stamps and
the server passes straight into `rewind.at()`.

**Reasoning** (a concrete API-behavior fact forcing the choice, matching the style of Phase 3's
`setFixedTimestep`-over-`setTimestep` call, not a preference):

1. Phase 3 rejected `defineInput`/`predict.*` on a specific, checkable fact: a client's raw
   `room.send()` input "never reaches a server `defineInput()` buffer" — the coupling is structural,
   not incidental. **That same fact is true of `lastSeenBy()`'s auto-stamp**, since `RoomInput` (the
   thing that would capture a `renderTime`) is *only* allocated by `defineInput()`
   (`RoomInput.d.ts:6–7`) — so `lastSeenBy()` falls under the exact rule Phase 3 already established
   for this codebase, and adopting it would mean adopting the whole input-transport swap.
2. **`Rewind.at(time)` does not share that fact.** Its own doc explicitly designs for a
   caller-supplied timestamp "from a value stored on the entity" as an alternative to the framework
   auto-stamp (`Rewind.d.ts:251`), and nothing in `Rewind`'s implementation surface touches
   `RoomInput`/`defineInput`. This is the same "is this incremental or all-or-nothing" test Phase 3
   applied to `predict.*` — but `Rewind`'s recording/query half gives the opposite answer.
3. The state to rewind (`MatchState.players: MapSchema<PlayerState>`, numeric `x`/`y`/`vx`/`vy`/
   `facing`, `packages/shared/src/schema/state.ts:3–23`) already exists unchanged since Phase 2/3 —
   `attachAll(this.state.players, { fields: ["x", "y"] })` needs zero schema changes and slots
   directly into `MatchRoom#onCreate` next to the existing `this.setState(new MatchState())`
   (`MatchRoom.ts:37`).
4. The only wire change is adding one numeric field to the existing custom `InputFrame` message —
   not a transport swap, not new message types, not touching `MESSAGE_TYPES.INPUT`'s handler shape
   in `MatchRoom.ts:41–43`.
5. Hand-rolling the ring-buffer-plus-interpolation logic that `Rewind.attachAll`/`valueAt` already
   implements (per-field numeric history rings, `linear`/`step` reconstruction between samples, the
   `maxRewindMs` anti-spoof clamp, live-value fallback — `Rewind.d.ts:76–111`, `200–205`, `242–258`)
   would just reimplement a shipped, presumably-tested primitive for no behavioral gain, with real
   risk of subtly diverging from it (e.g. getting the clamp or the live-fallback edge case wrong).

**Caveat to resolve before relying on this in Phase 4's gate:** the cadence ambiguity in §2 — verify
empirically whether `allowRewindState`'s auto-record actually fires per-tick or per-broadcast in
`0.18.13`, or sidestep it by calling `rewind.record()` explicitly inside `MatchRoom#tick()` (the API
supports this, `Room.d.ts:610–611`) so the rewind resolution is pinned to the sim tick rate the way
Phase 3's determinism guarantees expect, rather than trusting an unverified auto-cadence.

**Sources:** `node_modules/@colyseus/core/build/Rewind.d.ts`, `node_modules/@colyseus/core/build/
Room.d.ts` (`allowRewindState` doc block and `_timelineMode`, lines 583–613; `defineInput` doc
block, lines 404–438), `node_modules/@colyseus/core/build/input/types.d.ts` (`InputAccessor
.renderTime`/`.reckonTime`, lines 394–431), `node_modules/@colyseus/core/build/input/RoomInput.d.ts`
(class doc and `capture`/`handshakeSections`, lines 1–105) — all under
`@colyseus/core@0.18.13` in `node_modules/.pnpm/`. `node_modules/@colyseus/sdk/build/input/
InputHandle.d.ts` lines 1–96 (`@colyseus/sdk@0.18.2`). Repo-side: `apps/server/src/rooms/
MatchRoom.ts`, `apps/server/src/rooms/InputQueue.ts`, `packages/shared/src/schema/state.ts` — all
read directly, checked 2026-09-15.
