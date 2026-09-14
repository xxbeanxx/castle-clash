# Gameplay rules live in `packages/shared` as a pure, isomorphic sim

Physics, the combat state machine, hazards, and power-up modifiers are pure functions in
`packages/shared`: no I/O, no DOM, no Node APIs, no wall-clock reads. The server runs this code
authoritatively; the client runs the identical code for local prediction. The sim itself operates
on plain objects (`SimState`), separate from the `@colyseus/schema` network classes — a
`projectToSchema()` step copies sim state into schema once per tick, rather than the sim running
directly on schema instances.

We considered writing gameplay rules directly against `@colyseus/schema` classes in the server, or
duplicating physics/combat logic between server and client. Both were rejected: schema instances
carry network-sync overhead and mutation-tracking machinery that has no reason to run during
prediction or in a determinism test, and duplicated logic drifts — the server and client would
eventually disagree about what a jump or a hit looks like. A pure, plain-object sim keeps
`MatchRoom` a thin adapter (network messages in, `GameSimulation.step()` calls out, schema
projection back), lets most gameplay tests run with no network, canvas, or database, and makes
`SimState` cheap to clone and hash for prediction, replay, and determinism tests. With ≤ 8 players
the per-tick copy into schema doesn't matter.

The isomorphic boundary is enforced today, not just documented: `packages/shared`'s `tsconfig.json`
sets `types: []`, so any use of `window`, `document`, or `process` fails typecheck, and the root
ESLint config blocks `packages/shared/**` from importing `react`, `pixi.js`, `@supabase/*`,
`@castle-clash/server`, or `@castle-clash/client`.

No sim code exists yet — `packages/shared` currently holds only `config/`, `types/`, `input/`, and
`math/`. This ADR fixes the shape before `sim/`, `combat/`, `arenas/`, and `schema/` land in later
phases.
