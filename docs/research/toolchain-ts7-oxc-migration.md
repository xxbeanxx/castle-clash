# Toolchain Migration Research: TypeScript 7, oxlint, oxfmt

Research date: 2026-09-14. Scope: whether this repo can safely migrate (1) `typescript@6.0.3` →
`typescript@7.x`, (2) ESLint → `oxlint`, and (3) Prettier → `oxfmt`. Every fact below is sourced to
a primary source (npm registry, the tool's own docs/GitHub repo/CHANGELOG) — blog posts and
community write-ups were used only to locate primary sources, never cited as the fact itself,
consistent with `phase1-version-assumptions.md`'s methodology. This doc extends that file's item 8
(TypeScript 7) rather than duplicating it; read that item first for how the current `6.0.3` pin was
decided.

---

## 1. TypeScript 6 → 7

**Current pin:** `typescript@6.0.3` (root `package.json`), because `typescript-eslint@8.70.0`'s
peer range excludes 7.x and TS 7.0 shipped with no programmatic compiler API.

**(a) Current fact:**

- `typescript@latest` on npm is still **7.0.2**, unchanged since the Phase 1 check. The `next`
  dist-tag is **`7.1.0-dev.20260913.1`** — a dev prerelease published the day before this research
  date, not a stable release. **7.1 has not shipped.** `dist-tags` pulled directly from the
  registry: `latest 7.0.2`, `next 7.1.0-dev.20260913.1`, `rc 7.0.1-rc`. Source:
  `https://registry.npmjs.org/typescript` (dist-tags), checked 2026-09-14.
- TypeScript's own 7.0 announcement confirms: `tsc` is still the CLI entry point (`npx tsc`), not
  a separate `tsgo` binary — "Corsa"/`tsgo` is the internal engine name for the Go-native compiler,
  not a new command a project needs to invoke. `tsc -p tsconfig.json --noEmit`, the exact command
  this repo's `typecheck` scripts run, is unaffected in shape. The announcement explicitly states
  `moduleResolution: "bundler"`/`"nodenext"` are the **recommended** settings going forward (this
  repo already uses them), and confirms **"TypeScript 7 does not yet expose a stable programmatic
  API,"** with **"TypeScript 7.1 is expected to ship with a new (and different) API"** — not yet
  released, per the dist-tag check above. For teams needing the old API now, Microsoft ships a
  compatibility package, `@typescript/typescript6` (a rebadged 6.x compiler), to run alongside the
  `typescript` 7.x package. Source:
  `https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/`.
- `experimentalDecorators`/`useDefineForClassFields: false` (required by `@colyseus/schema`'s
  legacy decorator API) and `verbatimModuleSyntax` are syntax/emit-level compiler options, not part
  of the removed programmatic-API surface — no source found stating they were dropped or changed in
  7.0, and the 7.0 announcement's own `moduleResolution` guidance is compatible with this repo's
  current `bundler`/`nodenext` split between client and server. This repo's own Phase 1 doc (item 8)
  already reached the same conclusion for `experimentalDecorators`; nothing has changed since.
- `typescript-eslint@8.70.0`'s `peerDependencies` still declares
  **`"typescript": ">=4.8.4 <6.1.0"`**, re-confirmed today via the npm registry (`npm view
typescript-eslint peerDependencies` and the registry's `packument`). This is unchanged from
  Phase 1 — 7.x is still outright excluded, not just untested.
- `tsup@8.5.1` is still the current published `latest` (re-confirmed via registry). Its `dts: true`
  step (used by `packages/shared`'s tsup config) internally runs `rollup` + `rollup-plugin-dts`,
  and **crashes on TypeScript 7.0.x** — open GitHub issue
  `https://github.com/egoist/tsup/issues/1408` ("Add Support to Typescript V7") reproduces the
  crash directly with `typescript@7.0.2` + `tsup@8.5.1` + `dts: true` (an `undefined` access on
  `useCaseSensitiveFileNames` inside `rollup-plugin-dts`, caused by 7.0's missing programmatic
  API). A linked PR, `https://github.com/egoist/tsup/issues/1409` ("Add Support to Typescript V7"),
  proposes a fix but **is not merged and no tsup release incorporating it has shipped** as of this
  research date — `tsup@latest` is still `8.5.1`, the same version in the reproduction. There is
  no tsup version today that supports TS 7's `dts` step; isolatedDeclarations/oxc-based dts
  generation as a fallback is not implemented in any shipped tsup release either (only discussed
  as a possible future direction in the issue thread).
- `@react-router/dev@8`'s `typegen` does **not** depend on the TS programmatic compiler API: React
  Router's own docs describe it as executing the app's `routes.ts` route config and writing
  `+types/<route>.d.ts` files per route via its own Vite plugin/CLI codegen (string-templated
  types derived from the route tree), independent of `ts.createProgram`/`ts.transform`. `typegen`
  output then just needs to be present before `tsc --noEmit` runs (already how this repo's
  `typecheck` task is ordered) — nothing here is blocked by TS 7. Source:
  `https://reactrouter.com/explanation/type-safety`,
  `https://reactrouter.com/how-to/route-module-type-safety`.

**(b) Verdict:** **Not safe to bump `typescript` to 7.x today.** Two independent hard blockers,
both unchanged from Phase 1 and re-confirmed live:

1. `typescript-eslint@8.70.0`'s peer range (`<6.1.0`) excludes 7.x outright — installing
   `typescript@7.x` alongside it would produce a peer-dependency conflict regardless of whether
   this repo uses type-aware lint rules (it doesn't today, but the peer range is unconditional on
   the package itself, not on which rules are enabled).
2. `tsup@8.5.1`'s `dts` step (which `packages/shared` needs for its `.d.ts` bundle) crashes on
   TypeScript 7.0.x, per an open, unresolved upstream issue with no shipped fix.

Neither blocker is about missing features this repo needs from 7.x itself (`tsc -p ... --noEmit`,
decorators, module resolution modes, and React Router's typegen would all work fine under 7.0) —
both are about _other tools in this exact stack_ not yet tolerating 7.0's missing programmatic API.

**(c) Recommendation:** Stay pinned to `typescript@6.0.3`. Re-check when **all** of the following
have happened, not just one:

- `typescript@7.1.x` (or later) reaches the `latest` dist-tag as a stable release — today only a
  `7.1.0-dev.*` prerelease exists under `next`. Watch `https://registry.npmjs.org/typescript`
  dist-tags.
- `typescript-eslint` publishes a release whose `peerDependencies` range includes `7.x` (watch
  `https://github.com/typescript-eslint/typescript-eslint` releases/CHANGELOG, or simply
  `npm view typescript-eslint peerDependencies` again).
- `tsup` issue `#1408` / PR `#1409` (or an equivalent fix) lands in a released `tsup` version —
  watch `https://github.com/egoist/tsup/issues/1408` and `tsup`'s own npm version history for a
  release notes entry mentioning TS 7.

If oxlint (see §2) removes ESLint/`typescript-eslint` from this repo's toolchain entirely, blocker
1 goes away on its own — but blocker 2 (`tsup`'s `dts` step) is independent of the lint toolchain
and would still gate a TS7 bump even in an oxlint-only, ESLint-free repo.

**(d) Sources:**

- `https://registry.npmjs.org/typescript` (dist-tags, checked 2026-09-14)
- `https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/`
- `https://registry.npmjs.org/typescript-eslint` (`peerDependencies`, checked 2026-09-14)
- `https://github.com/egoist/tsup/issues/1408`
- `https://github.com/egoist/tsup/issues/1409`
- `https://registry.npmjs.org/tsup` (checked 2026-09-14, `latest` still `8.5.1`)
- `https://reactrouter.com/explanation/type-safety`
- `https://reactrouter.com/how-to/route-module-type-safety`
- `docs/research/phase1-version-assumptions.md` item 8 (prior finding this extends)

---

## 2. ESLint → oxlint

**(a) Current fact:**

- `oxlint@latest` on npm is **1.83.0**. Source: `https://registry.npmjs.org/oxlint`, checked
  2026-09-14.
- **Config file formats:** oxlint auto-discovers, in the working directory, one of
  `.oxlintrc.json`, `.oxlintrc.jsonc`, `oxlint.config.ts`, or `oxlint.config.mts` — a `.ts`/`.mts`
  config is directly supported, not just JSON. A JSON config and a `.ts`/`.mts` config cannot
  coexist in the same directory (only one config _kind_ is picked up), and `oxlint.config.ts` vs
  `oxlint.config.mts` are likewise mutually exclusive. `.ts` config files require the Node-based
  `oxlint` npm package (not the standalone Rust binary) and Node ≥22.18 or ≥24 (i.e. Node's own
  native TS type-stripping, not a separate transpile step). The exported config is a plain object,
  conventionally wrapped in a `defineConfig()` helper for editor typing:
  ```ts
  import { defineConfig } from "oxlint";
  export default defineConfig({/* ... */});
  ```
  Source: `https://oxc.rs/docs/guide/usage/linter/config`,
  `https://oxc.rs/docs/guide/usage/linter/config-file-reference`.
- **Per-glob rule scoping:** oxlint's config schema has a top-level `overrides` array; each entry
  takes `files` (glob patterns to match — the direct equivalent of ESLint flat config's per-object
  `files`), an optional `excludeFiles`, and its own `rules` (and can enable/disable `plugins`
  scoped to that override too). This is a structural equivalent to ESLint flat config's "multiple
  config objects with different `files` globs," not a lesser approximation of it. Source:
  `https://oxc.rs/docs/guide/usage/linter/config-file-reference`.
- **Import restriction rule:** oxlint natively implements `no-restricted-imports` (documented at
  `https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports`, grouped under
  oxlint's "eslint" core-rules category but used in config **without** an `eslint/` prefix — the
  bare key `"no-restricted-imports"`). It supports the same option shape this repo's
  `eslint.config.js` already uses: `paths` (exact specifier + `message`), `patterns` (e.g. a
  `group` glob like `@supabase/*`, + `message`), plus `importNames`/`allowImportNames`/`regex`/
  `allowImportNamePattern` beyond what this repo currently uses. Confirmed via the rule's own doc
  page, which gives the exact config key in both JSON and `.ts` form.
- **React-hooks-equivalent rules:** oxlint natively implements (in Rust, under its `react` plugin,
  not a separate `react-hooks` plugin) both rules this repo's `eslint-plugin-react-hooks`
  `recommended` config turns on: `react/rules-of-hooks` and `react/exhaustive-deps` — confirmed via
  each rule's own doc page and config-key example. Several open oxc-project GitHub issues (e.g.
  `#18328`, `#17765`) note small behavioral diffs from `eslint-plugin-react-hooks` (error position
  on a different line, some edge cases in `exhaustive-deps`'s dependency-completeness check) — real
  gaps worth knowing about, but not a missing-feature blocker; the rules exist and are enabled the
  same way (`plugins: ["react"]` + per-glob `overrides`).
- **Bottom line on the "can it express per-glob-scoped rule sets at all" question:** yes, cleanly —
  `overrides[].files` is a first-class mechanism, not a workaround, and both of this repo's
  path-scoped rules (the `packages/shared/**` and `apps/client/app/game/**` `no-restricted-imports`
  rules) and the `apps/client/app/**` react-hooks rules map onto it directly.

**(b) Verdict:** oxlint can replicate every rule this repo's `eslint.config.js` currently enforces,
including the two path-scoped `no-restricted-imports` rules that encode ADR 0001's isomorphic
boundary (the architecturally load-bearing one) and the `apps/client/app/**`-scoped react-hooks
rules. `typescript-eslint`'s `recommended` (non-type-checked) ruleset — the other current baseline
— maps onto oxlint's native `typescript` plugin category, which is out of scope for this doc's
questions but not a blocker (oxlint ships that plugin natively too, and this repo doesn't use
type-aware rules today, so nothing is lost).

**(c) Recommendation:** **Proceed.** Install `oxlint@1.83.0`, configure via `oxlint.config.ts`
(requires Node ≥22.18/24, which this repo already targets — Node 24 per `CLAUDE.md`). Shape,
translating the current `eslint.config.js` 1:1:

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [
    "**/dist/**",
    "**/build/**",
    "**/.turbo/**",
    "**/node_modules/**",
    "**/.react-router/**",
  ],
  plugins: ["typescript", "react"],
  rules: {
    // baseline: oxlint's own "correctness"/typescript categories cover
    // js.configs.recommended + tseslint.configs.recommended's non-type-checked rules
  },
  overrides: [
    {
      files: ["packages/shared/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@castle-clash/server",
                message: "shared must stay isomorphic; it cannot depend on server.",
              },
              {
                name: "@castle-clash/client",
                message: "shared must stay isomorphic; it cannot depend on client.",
              },
              {
                name: "pixi.js",
                message: "shared must stay isomorphic; it cannot depend on pixi.js.",
              },
              { name: "react", message: "shared must stay isomorphic; it cannot depend on react." },
            ],
            patterns: [
              {
                group: ["@supabase/*"],
                message: "shared must stay isomorphic; it cannot depend on Supabase.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["apps/client/app/**/*.{ts,tsx}"],
      rules: {
        "react/rules-of-hooks": "error",
        "react/exhaustive-deps": "warn",
      },
    },
    {
      files: ["apps/client/app/game/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "react",
                message: "app/game must stay React-free; it runs Pixi imperatively.",
              },
            ],
          },
        ],
      },
    },
  ],
});
```

Two things to verify by hand once this is written for real (not confirmed by docs alone): (1) that
`react/exhaustive-deps`'s severity/option shape in `eslint-plugin-react-hooks`'s own
`recommended` config (`error` vs `warn`) is matched deliberately, not left at oxlint's own default;
(2) run oxlint against `apps/client/app/**` once implemented and diff its findings against the
current ESLint output, given the noted upstream behavioral-diff issues on `exhaustive-deps`.

**(d) Sources:**

- `https://registry.npmjs.org/oxlint` (checked 2026-09-14)
- `https://oxc.rs/docs/guide/usage/linter/config`
- `https://oxc.rs/docs/guide/usage/linter/config-file-reference`
- `https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports`
- `https://oxc.rs/docs/guide/usage/linter/rules/react/rules-of-hooks`
- `https://oxc.rs/docs/guide/usage/linter/rules/react/exhaustive-deps`
- `https://github.com/oxc-project/oxc/issues/18328`, `https://github.com/oxc-project/oxc/issues/17765`
  (known `exhaustive-deps` behavioral diffs vs `eslint-plugin-react-hooks`)

---

## 3. Prettier → oxfmt

**(a) Current fact:**

- A package literally named **`oxfmt`** exists and is published on npm — current `latest` is
  **`0.68.0`** (re-confirmed directly against the registry; npm's own package-search UI shows a
  same-week `0.6x.0` release too, consistent with active weekly-ish point releases). Platform
  binaries ship as separate `@oxfmt/binding-<platform>` packages that `oxfmt` depends on. Source:
  `https://registry.npmjs.org/oxfmt` (checked 2026-09-14), `https://www.npmjs.com/package/oxfmt`.
- **Maturity:** oxc's own blog posts are the authoritative maturity signal, and they're explicit
  about staged labels: **alpha** (`https://oxc.rs/blog/2025-12-01-oxfmt-alpha.html`, Dec 2025) →
  **beta** (`https://oxc.rs/blog/2026-02-24-oxfmt-beta`, Feb 2026). No GA/v1.0/"stable" post exists
  in oxc's blog index as of this research date, and the package is still versioned `0.x` on npm
  (semver-conventionally pre-1.0/not-yet-stable) seven months after the beta announcement, with
  frequent point releases continuing. **Current status: beta, not GA**, per the project's own
  self-description — no evidence found of a stable/1.0 milestone shipping or being imminently
  scheduled.
- **Config file support:** yes, both a JSON form (`.oxfmtrc.json`, scaffolded via `oxfmt --init`)
  and a **dynamic TypeScript config, `oxfmt.config.ts`**, per the formatter quickstart docs. The
  `.ts` config path is explicitly called out as an **npm-package feature, not available from the
  standalone Rust binary distribution** — this repo would need to install `oxfmt` via the npm
  package (as it already does for other tooling), not a bare downloaded binary, to use a `.ts`
  config. Source: `https://oxc.rs/docs/guide/usage/formatter/quickstart.html`.
- **Defaults vs. this repo's Prettier config:** oxfmt's own config-file reference states its
  defaults directly: **`printWidth` defaults to 100**, and **`trailingComma` defaults to `"all"`**
  — both exactly match this repo's current `.prettierrc.json` (`printWidth: 100`,
  `trailingComma: "all"`), so a migration would need **no override** for either setting; the
  defaults already are this repo's settings. Source:
  `https://oxc.rs/docs/guide/usage/formatter/config-file-reference`.
- **Prettier-compatibility claim:** oxfmt's own beta announcement states it **"now passes 100% of
  Prettier's JavaScript and TypeScript conformance tests"** and that "when migrating from recent
  versions of Prettier, formatting differences should not occur; any formatting differences are
  considered bugs" (and are tracked upstream against oxfmt/Prettier's own test suites, per the beta
  post). It ships a first-class `oxfmt --migrate prettier` command that reads an existing
  `.prettierrc`/`prettier` config and emits an equivalent oxfmt config, rather than requiring a
  hand port. Source: `https://oxc.rs/blog/2026-02-24-oxfmt-beta`.

**(b) Verdict:** oxfmt is real, published, actively maintained, `.ts`-config-capable, and its
_defaults already match this repo's Prettier settings exactly_ — an unusually clean fit. The one
real caveat is maturity: it's labeled **beta**, not GA, by its own maintainers, with no stable
release announced as of this research date.

**(c) Recommendation:** **Proceed, but treat it as a beta dependency, not a settled one.** Given
that (i) the user explicitly asked for this migration, (ii) `printWidth`/`trailingComma` need zero
config changes since the defaults already match, and (iii) the tool claims and appears to
demonstrate (100% conformance-test pass rate) practical Prettier-output parity, there's no reason
to wait for GA — but do this migration in a way that's easy to revert:

- Install the npm package (`oxfmt@0.68.0`, or whatever `latest` is at implementation time — re-check
  the registry, since it revs roughly weekly), not a standalone binary, specifically to keep the
  `.ts` config path available.
- Run `oxfmt --migrate prettier` once against the existing `.prettierrc.json` to generate
  `oxfmt.config.ts` as a starting point, then hand-verify the generated config, rather than writing
  it from scratch.
- Run oxfmt across the full existing tree once, `git diff` the result, and treat any non-trivial
  diff as a signal to hold off (oxfmt's own docs invite reporting such diffs as bugs) rather than
  accepting silent reformatting.
- Pin the exact `oxfmt` version in `package.json` (not a caret range) given the pace of point
  releases under active beta development, and revisit the pin deliberately rather than floating it.
- Watch for a stable/1.0 announcement on `https://oxc.rs/blog` or a "stable" heading appearing on
  `https://oxc.rs/docs/guide/usage/formatter.html` as the signal beta caveats are lifted.

Example `oxfmt.config.ts` shape (defaults shown explicitly even though they don't need overriding,
so the file documents the repo's intent rather than relying on silently-matching defaults):

```ts
// oxfmt.config.ts
import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 100,
  trailingComma: "all",
});
```

**(d) Sources:**

- `https://registry.npmjs.org/oxfmt` (checked 2026-09-14)
- `https://www.npmjs.com/package/oxfmt`
- `https://oxc.rs/blog/2025-12-01-oxfmt-alpha.html`
- `https://oxc.rs/blog/2026-02-24-oxfmt-beta`
- `https://oxc.rs/docs/guide/usage/formatter/quickstart.html`
- `https://oxc.rs/docs/guide/usage/formatter/config-file-reference`
- `https://oxc.rs/docs/guide/usage/formatter.html`

---

## Summary table

| #   | Tool             | Current version                                                   | `.ts` config supported                                                    | Replicates this repo's current setup                                                                          | Verdict                                                                                                          | Blocker (if any) / what to watch                                                                                                                                                                                                                                                                                                              |
| --- | ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TypeScript 6→7   | `typescript@7.0.2` latest; `7.1.0-dev.*` is a dev prerelease only | n/a                                                                       | n/a                                                                                                           | **Do not bump yet** — stay on `6.0.3`                                                                            | (a) `typescript-eslint@8.70.0` peer range `<6.1.0` excludes 7.x; (b) `tsup@8.5.1`'s `dts` step crashes on TS 7.0.x (open issue `egoist/tsup#1408`, unmerged PR `#1409`). Watch: stable `typescript@7.1.x` on `latest`, a `typescript-eslint` release with a 7.x-inclusive peer range, and a `tsup` release incorporating #1409 or equivalent. |
| 2   | ESLint → oxlint  | `oxlint@1.83.0`                                                   | Yes — `oxlint.config.ts`/`oxlint.config.mts`, auto-discovered             | Yes — `overrides[].files` + bare `no-restricted-imports` key + `react/rules-of-hooks`/`react/exhaustive-deps` | **Proceed**                                                                                                      | None blocking; minor known behavioral diffs vs `eslint-plugin-react-hooks`'s `exhaustive-deps` (oxc issues #18328, #17765) worth spot-checking after migration.                                                                                                                                                                               |
| 3   | Prettier → oxfmt | `oxfmt@0.68.0`                                                    | Yes — `oxfmt.config.ts` (npm-package install only, not standalone binary) | Yes — default `printWidth: 100` / `trailingComma: "all"` already match this repo's `.prettierrc.json`         | **Proceed, but as a beta dependency** — pin exact version, verify full-tree diff before committing, watch for GA | Not GA yet (beta since Feb 2026, no stable/1.0 announcement found). Watch `oxc.rs/blog` for a stable release post.                                                                                                                                                                                                                            |
