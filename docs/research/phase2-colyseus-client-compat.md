# Phase 2 Colyseus/Client SDK Compatibility Check

Research date: 2026-09-14. Scope: a single, narrow version-compatibility question raised while
scaffolding `apps/client`'s Colyseus connection against the server's `colyseus@0.18.5` +
`@colyseus/schema@5.0.32` stack (the server side is already pinned this way; see
`packages/shared/package.json`'s `"@colyseus/schema": "5.0.32"` and `docs/research/phase1-version-assumptions.md`
item 2/3). This is not a general audit — see that file for the broader Phase 1 version sweep.
Primary sources only (npm registry JSON, the vendor's own GitHub repos/CHANGELOGs, and
docs.colyseus.io); anything from a search-engine synopsis is marked as such below.

---

## 1. Is there a wire-protocol handshake that would reject a `colyseus@0.18.x` server talking to `colyseus.js@0.16.22`?

**(a) Current fact:**

- `colyseus.js`'s `src/Protocol.ts` (GitHub `colyseus/colyseus.js`, `master`) defines a `Protocol`
  enum of message type byte-codes (0–127), including `HANDSHAKE = 9`, `JOIN_ROOM = 10`,
  `LEAVE_ROOM = 12`, and the room state-sync codes `13`–`17`. There is no protocol *version number*
  field in this enum — the codes themselves are the protocol, not a negotiated version.
- `colyseus.js`'s `src/Connection.ts` (same repo/branch) contains no version-check or
  handshake-negotiation logic — it's a thin transport-selection wrapper (`WebSocketTransport` vs.
  `H3Transport`) with `connect()`/`send()`/`close()`. Any actual join/handshake exchange lives in
  `Room.ts`/`Client.ts`, which were not read line-by-line for this narrow check (see caveat below).
- No explicit "reject on protocol/schema version mismatch" mechanism was found in the files
  examined. This means a stale client is more likely to **silently misdecode state** than to be
  cleanly refused at connect time — see item 2.

**(b) Verdict:** No confirmed wire-level version handshake that would hard-reject the connection.
**Caveat:** this check read `Protocol.ts` and `Connection.ts` only, not the full `Room.ts`/
`Client.ts` join-and-reconnect path or the server-side `onJoin`/seat-reservation code, so a
narrower handshake check elsewhere in the join flow cannot be fully ruled out. Nothing found
changes the practical conclusion in item 4 (pin to `@colyseus/sdk`), since that sidesteps the
question entirely by matching versions instead of relying on graceful rejection.

**(c) Sources:**

- https://github.com/colyseus/colyseus.js/blob/master/src/Protocol.ts
- https://github.com/colyseus/colyseus.js/blob/master/src/Connection.ts

---

## 2. Does `@colyseus/schema` decode require a matching MAJOR version, or is the wire format version-agnostic?

**(a) Current fact — this is the crux, and it's directly confirmed in the vendor's own CHANGELOG:**

`@colyseus/schema`'s CHANGELOG.md (`colyseus/schema`, `master` branch) has a dedicated
**"Wire format"** section under the `[5.0.11]` entry (the major 4→5 release), which states, verbatim:

> Byte-identical to 4.x except for these three, which **every SDK decoder must implement** for the
> 0.18 line:
> - **`ADD` at an occupied array index means insert**, shifting items up (previously only
>   `index === 0` was special-cased)...
> - **`ArraySchema` deletes of Schema children are always `DELETE_BY_REFID`.** Decoders must skip
>   operations for unknown refIds entirely...
> - **The reflection payload retired its colon grammar.** `"quantized:min,max,bits,wrap"` and
>   `"array:string"` are gone...

This is an explicit, vendor-authored statement that the 5.x wire format is **not** a superset-compatible
extension of what a pre-5.0.11 decoder understands — three specific decode behaviors changed, and the
CHANGELOG calls out that **the 0.18 server line depends on the client decoder implementing them**.
A `@colyseus/schema@^3.0.0`-based decoder (what `colyseus.js@0.16.22` bundles) predates both the 4.x
and 5.x line entirely, so it implements none of these three behaviors.

A second, later wire-format change compounds this: `[5.0.27]`'s entry says "The wire mapping for
these fields changed: update your client SDK alongside the server" for quantized/angle field
encoding — another explicit "client and server must move together" note.

Separately, decode-side API churn between v3/v4/v5 (removal of the old `filters`/`@filter()`
system in favor of `StateView`/`.view()`, and the callback API moving from `.onAdd`/`.onChange`
instance methods to the `getStateCallbacks(room)` / `$(state).listen(...)` functional API) is
real but is **API-surface**, not wire-format — it doesn't bear on this question directly, except
that it means a v3 client couldn't even use the v5-only `StateView`/callback APIs the server-side
schema classes may rely on, on top of the raw decode-corruption risk above.

**(b) Verdict:** **No, this is not version-agnostic.** The wire format is *mostly* stable across
majors, but v5.0.11 (needed for the 0.18 server line) made three targeted, breaking decode changes
that the vendor explicitly says every SDK decoder must implement, plus a further breaking field-encoding
change in v5.0.27. A `@colyseus/schema` v3 decoder bundled inside `colyseus.js@0.16.22` will
silently misdecode (not cleanly reject) state produced by a v5.0.32 encoder — array inserts,
Schema-child array deletes, and quantized/angle fields are all specifically named as broken.

**(c) Sources:**

- https://github.com/colyseus/schema/blob/master/CHANGELOG.md (entries `[5.0.11]`, `[5.0.27]`; full
  text saved and grepped during this research)

---

## 3. What client SDK does the official Colyseus documentation currently recommend for a `colyseus@0.18.x` server?

**(a) Current fact:**

- **`colyseus.js` is no longer the documented client package.** `docs.colyseus.io`'s current
  TypeScript client page (https://docs.colyseus.io/getting-started/typescript) gives the install
  command as `npm install --save @colyseus/sdk` — not `colyseus.js` — for npm/pnpm/yarn/bun alike,
  and states "The SDK includes TypeScript definitions out of the box." The page makes no mention of
  `colyseus.js` at all.
- **The official 0.17 migration guide is explicit and unambiguous about the swap.**
  https://docs.colyseus.io/migrating/0.17 instructs: "On the frontend, replace `colyseus.js` with
  the `@colyseus/sdk` package," showing the `package.json` change from
  `"colyseus.js": "^0.16.x"` to `"@colyseus/sdk": "^0.17.26"`.
- **`@colyseus/sdk` on npm:** dist-tags `latest` and `next` are both **`0.18.2`**
  (`npm view @colyseus/sdk dist-tags`). Its `dependencies` (`npm view @colyseus/sdk dependencies`)
  are:
  ```json
  {
    "ws": "^8.13.0",
    "tslib": "^2.1.0",
    "msgpackr": "^2.0.1",
    "@colyseus/schema": "^5.0.8",
    "@colyseus/better-call": "^1.3.1",
    "@colyseus/shared-types": "^0.18.1"
  }
  ```
  i.e. it depends on `@colyseus/schema` **v5**, matching the server's schema major exactly. Its
  version line (`0.17.0` → `0.17.43` → `0.18.0` → `0.18.1` → `0.18.2`, from `npm view @colyseus/sdk versions`)
  tracks the same `0.17`/`0.18` numbering as the `colyseus` server package itself.
- **`@colyseus/sdk` lives in the main `colyseus/colyseus` monorepo, not the separate
  `colyseus/colyseus.js` repo** — `npm view @colyseus/sdk repository` resolves to
  `git://github.com/colyseus/colyseus.git`. This is a structural fact, not just a naming change: the
  client SDK was folded into the server's own release train (so it version-locks with the server by
  construction going forward), rather than continuing life as an independently-versioned sibling
  package.
- **`colyseus.js` itself was not merely "slow to publish a 0.17/0.18 build" — it has no such
  branch or tag at all.** `colyseus/colyseus.js`'s GitHub branches (`git branches` via the GitHub
  API) are only `0.9`, `0.10`, `0.11.0-autoreconnect`, `0.12.x`, `0.13.0`, `0.15`, `0.16`,
  `decentraland-sdk7`, `dev`, `devmode`, `master`, `webtransport` — no `0.17` or `0.18` branch
  exists. Its GitHub Releases stop at `0.16.21`. Its `package.json` on `master`
  (`https://raw.githubusercontent.com/colyseus/colyseus.js/master/package.json`) is at version
  `"0.16.23"` (an unreleased patch bump of the same 0.16 line) and still lists
  `"@colyseus/schema": "^3.0.0"` as a dependency — confirming the repo was never updated past the
  v3-schema/0.16-server era, consistent with it having been superseded rather than paused.
- npm's `colyseus.js` package itself is **not** npm-deprecated (`npm view colyseus.js@0.16.22 deprecated`
  returns nothing/empty — no deprecation notice is set), and its README doesn't self-describe as
  deprecated either. So this conclusion rests on the *docs and migration guide* recommending the
  successor package, not on an npm-level deprecation flag or README notice — worth knowing if
  someone later greps npm metadata and finds no deprecation warning and assumes `colyseus.js` is
  still the sanctioned choice.

**(b) Verdict:** The current, documented, vendor-recommended pairing for a `colyseus@0.18.x` server
is **`@colyseus/sdk`**, not `colyseus.js`. This is stated directly on the current getting-started
page and in the 0.17 migration guide, and is corroborated structurally by `@colyseus/sdk`'s
dependency on `@colyseus/schema@^5.0.8` and its home in the `colyseus/colyseus` monorepo.

**(c) Sources:**

- https://docs.colyseus.io/getting-started/typescript
- https://docs.colyseus.io/migrating/0.17
- `npm view @colyseus/sdk dist-tags/dependencies/versions/repository` (npm registry metadata, checked 2026-09-14)
- https://raw.githubusercontent.com/colyseus/colyseus.js/master/package.json
- GitHub API: `repos/colyseus/colyseus.js/branches`, `repos/colyseus/colyseus.js/releases` (checked 2026-09-14)
- `npm view colyseus.js@0.16.22 deprecated` (npm registry metadata, checked 2026-09-14)

---

## 4. What is the currently correct fix?

**(a) Current fact — answering each sub-question from the brief directly:**

- **Is there an unpublished/prerelease `colyseus.js` matching 0.18.x under a non-`latest` dist-tag?**
  No. Every `colyseus.js` dist-tag (`latest`, `next`, `preview`, `alpha`, `beta`, `legacy`) resolves
  to a `0.16.x`-or-earlier version (`npm view colyseus.js dist-tags`: `latest=0.16.22`,
  `next=0.16.20`, `preview=0.16.0-preview.25`, `alpha=0.15.15-alpha.2`, `beta=0.11.6-beta.2`,
  `legacy=0.15.28`). There is no hidden 0.17/0.18 `colyseus.js` build anywhere on npm or in the
  GitHub repo's branches/tags/releases (see item 3).
- **Is schema decoding vendored/internalized into the client SDK, so it doesn't need
  `@colyseus/schema` as a direct dependency at all?** No — `@colyseus/sdk@0.18.2` lists
  `"@colyseus/schema": "^5.0.8"` as a real, non-bundled `dependencies` entry (confirmed via
  `npm view @colyseus/sdk dependencies`), and its published type declarations
  (`unpkg.com/@colyseus/sdk@0.18.2/build/index.d.ts`) show it re-exports only `Callbacks` (a type
  utility) and the `getStateCallbacks`/`registerSerializer`/`SchemaSerializer` functions from
  `@colyseus/schema` — it does **not** re-export `Schema`, `MapSchema`, or `ArraySchema` themselves.
  So schema decoding is not vendored away; `@colyseus/schema` v5 is a real transitive dependency
  pulled in through `@colyseus/sdk`.
- **Does the plan need to pin the SERVER to an older colyseus/@colyseus/schema major instead?** No —
  that would be fighting the current, correct fix rather than using it: `@colyseus/sdk` already
  exists, is the officially documented pairing for `colyseus@0.18.x`, and depends on
  `@colyseus/schema@^5.0.8`, which matches the server's already-pinned `5.0.32`
  (`packages/shared/package.json`) with no downgrade needed anywhere.

**(b) Does the client need `@colyseus/schema` as a *direct* dependency of `apps/client`?**

Per ADR 0001 / the isomorphic-sim boundary already documented in `CLAUDE.md`, the `PlayerState`/
`MatchState` `@colyseus/schema` classes live in `packages/shared` (see the new, uncommitted
`packages/shared/src/schema/` directory in this repo's working tree), which already pins
`"@colyseus/schema": "5.0.32"` as a direct dependency. `apps/client` consumes those classes through
`@castle-clash/shared`'s public export, and gets the decode engine plus the `getStateCallbacks`
function through `@colyseus/sdk`. Neither of those requires `apps/client` itself to
`import ... from "@colyseus/schema"` directly — `@colyseus/sdk`'s own re-export of `getStateCallbacks`
and `Callbacks` covers the typed-callback API surface a client normally needs
(`const $ = getStateCallbacks(room); $(room.state).players.onAdd(...)`), and the concrete schema
*classes* to type `room.state` against come from `@castle-clash/shared`, not from importing
`@colyseus/schema` a second time. pnpm will still resolve a single deduped `@colyseus/schema@5.0.x`
instance in `node_modules` for the whole workspace, since `@colyseus/sdk`'s `^5.0.8` range and
`packages/shared`'s pinned `5.0.32` overlap — so there's no risk of two different schema class
identities floating around causing `instanceof` mismatches.

**(c) Sources:**

- `npm view colyseus.js dist-tags` (npm registry metadata, checked 2026-09-14)
- `npm view @colyseus/sdk dependencies` (npm registry metadata, checked 2026-09-14)
- https://unpkg.com/@colyseus/sdk@0.18.2/build/index.d.ts
- `/home/gbaker/Projects/github/xxbeanxx/castle-clash/packages/shared/package.json` (this repo, read-only — confirms the already-pinned `"@colyseus/schema": "5.0.32"`)
- `/home/gbaker/Projects/github/xxbeanxx/castle-clash/CLAUDE.md` (isomorphic-sim boundary / ADR 0001 pointer, for where schema classes are meant to live)

---

## Summary table

| # | Question | Answer |
| --- | --- | --- |
| 1 | Handshake rejects mismatched client? | No confirmed hard version-reject in `Protocol.ts`/`Connection.ts`; risk is silent decode corruption, not a clean refusal (full `Room.ts` join path not exhaustively checked) |
| 2 | Is schema decode wire-format version-agnostic across majors? | **No.** `@colyseus/schema` v5.0.11's own CHANGELOG names three decode behaviors "every SDK decoder must implement... for the 0.18 line"; v5.0.27 changed quantized-field wire mapping too. A v3-based decoder implements none of this. |
| 3 | What does docs.colyseus.io currently recommend for a 0.18.x server? | **`@colyseus/sdk`**, not `colyseus.js` — stated on the current TS client page and the 0.17 migration guide; `colyseus.js` has no 0.17/0.18 branch/tag/release anywhere |
| 4 | Correct fix | Use `@colyseus/sdk@0.18.2`; it depends on `@colyseus/schema@^5.0.8`, already compatible with the server's pinned `5.0.32`; no server downgrade needed |

---

## Recommendation

Pin `apps/client/package.json`'s client-SDK dependency to:

```json
"@colyseus/sdk": "0.18.2"
```

**Do not add `colyseus.js`** — it is not the documented pairing for a `colyseus@0.18.x` server, its
bundled `@colyseus/schema@^3.0.0` dependency cannot correctly decode state produced by the server's
`@colyseus/schema@5.0.32` encoder (per that package's own CHANGELOG-documented wire-format changes
in v5.0.11 and v5.0.27), and it has no 0.17/0.18-line release to upgrade to in the first place.

**Do not add `@colyseus/schema` as a direct dependency of `apps/client`.** It is not needed:
`@colyseus/sdk` re-exports the typed-callback surface (`getStateCallbacks`, `Callbacks`) a client
needs, the concrete `PlayerState`/`MatchState` schema classes come from `@castle-clash/shared`
(which already pins `@colyseus/schema@5.0.32` directly, matching the server), and pnpm dedupes the
single resulting `@colyseus/schema@5.0.x` install across the workspace since `@colyseus/sdk`'s
`^5.0.8` range and `packages/shared`'s `5.0.32` overlap. Only add it directly to `apps/client` if
client code ever needs to `import` from `@colyseus/schema` itself (e.g. the base `Schema` class for
a type-only cast) — and if that becomes necessary, pin it to the exact same `5.0.32` already used in
`packages/shared`, not a fresh `^5.x` range, to avoid two independently-floating semver ranges for
the same package.
