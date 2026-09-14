# Phase 1 Version/API Assumption Check

Research date: 2026-09-14. Scope: verify the library version and API assumptions in `docs/IMPLEMENTATION_PLAN.md` against primary sources (official docs, GitHub repos/READMEs/CHANGELOGs, npm registry). Blog posts and secondary write-ups were used only to locate primary pages, never as the cited source of a fact — every claim below is sourced to the library's own docs/repo/registry entry.

Plan line references are to `docs/IMPLEMENTATION_PLAN.md` as it stands today.

---

## 1. React Router v8

**Plan assumption** (line 21, 28): "React Router v8 in SPA mode (`ssr: false`; ...)"; client dir comment "React Router v8 (SPA) + PixiJS".

**(a) Current fact:**

- npm `react-router` latest is **8.3.1** — v8 is indeed the current stable major. Source: https://registry.npmjs.org/react-router/latest
- SPA mode is alive and documented exactly as the plan describes: set `ssr: false` in `react-router.config.ts`. The framework still server-renders the root route once at _build time_ to produce `index.html`, then the app hydrates and all further navigation is client-side. Source: https://reactrouter.com/how-to/spa
- `clientLoader`/`clientAction` are the current, unchanged APIs for data loading/mutation in SPA mode (used on non-root routes; the root route gets a build-time `loader` plus a `HydrateFallback` component for the pre-hydration UI). Source: https://reactrouter.com/how-to/spa
- Scaffolding: `npx create-react-router@latest <app-name>` is the current create command. There is **no dedicated "SPA mode" scaffold flag/template** in the official template set (`remix-run/react-router-templates`) — the documented and only supported path is to scaffold the default template and then flip `ssr: false` in `react-router.config.ts` yourself. `--template <owner>/<repo>/<template-name>` is the flag for choosing among the maintained templates (default, node-custom-server, community templates), none of which is an "spa" preset. Sources: https://reactrouter.com/start/framework/installation, https://github.com/remix-run/react-router-templates

**(b) Was the plan correct?** Yes, on all counts — v8 is current, `ssr: false` still works, `clientLoader` API is unchanged.

**(c) Replacement wording (only a clarification, not a correction):** Add a note that there is no `--template spa` (or similar) scaffold flag: scaffold with `npx create-react-router@latest apps/client` (default template) and then hand-edit `react-router.config.ts` to add `ssr: false`, as shown in the plan already. No change needed to the plan's technical claims.

**(d) Sources:**

- https://registry.npmjs.org/react-router/latest
- https://reactrouter.com/how-to/spa
- https://reactrouter.com/start/framework/installation
- https://github.com/remix-run/react-router-templates

---

## 2. Colyseus

**Plan assumption** (line 21): "Use Colyseus 0.16+"; (line 189) plain `index.ts` Colyseus server bootstrap; (line 191) `setSimulationInterval`; (line 232) `setPatchRate(1000 / PATCH_RATE)`; (line 199) `@colyseus/testing`: `boot`, `connectTo`, `waitForNextPatch`; (line 328) `gameServer.define("match", MatchRoom).filterBy(["mode","code"])`; (line 330) `allowReconnection(client, 20)`; (line 448-449) `onAuth` verifies JWT via JWKS.

**(a) Current fact:**

- npm `colyseus` latest is **0.18.5** (same for `@colyseus/testing`, `@colyseus/core`, etc. — the whole family is versioned together on the 0.18.x line as of 2026-09-14). Source: https://registry.npmjs.org/colyseus/latest, https://registry.npmjs.org/@colyseus/testing/latest
- **Server bootstrap API has moved on.** Colyseus 0.17 replaced the old `@colyseus/tools` `config({...})` object (with `initializeGameServer`, `gameServer.define(...)`, `initializeTransport`, `initializeExpress`) with a single `defineServer()`/`defineRoom()` entry point from the `colyseus` package itself:
  ```ts
  // current (0.17+)
  import { defineServer, defineRoom } from "colyseus";
  import { MyRoom } from "./rooms/MyRoom";

  const server = defineServer({
    rooms: {
      my_room: defineRoom(MyRoom),
    },
    transport: new uWebSocketsTransport(),
    express: (app) => {
      /* ... */
    },
  });
  ```
  The old `new Server()` + `.define()` + `.listen()` / `@colyseus/tools config()` pattern is **soft-deprecated**: it still works today, but the docs explicitly recommend migrating and say it will eventually be removed. `filterBy()` is now chained off `defineRoom()`, not off `.define()`:
  ```ts
  rooms: {
    battle: defineRoom(BattleRoom).filterBy(['password']),
  }
  ```
  Sources: https://docs.colyseus.io/migrating/0.17, https://docs.colyseus.io/server, https://colyseus.io/blog/colyseus-017-is-here/
- `@colyseus/testing`'s `boot()`, `connectTo()`, and `waitForNextPatch()` **all still exist** with the same names and the same shape as the plan assumes:
  ```ts
  colyseus = await boot(appConfig);
  const client1 = await colyseus.connectTo(room);
  await room.waitForNextPatch();
  ```
  Source: https://docs.colyseus.io/tools/unit-testing
- `setSimulationInterval()` and `setPatchRate()` on `Room` are unchanged in behavior and name (`setPatchRate(null)` disables automatic patches; the plan's `setPatchRate(1000 / PATCH_RATE)` usage is still correct). Source: https://docs.colyseus.io/room
- `allowReconnection(client, seconds)` returning a rejectable `Deferred<Client>` is unchanged. Source: https://docs.colyseus.io/room/reconnection
- **`onAuth` signature changed** as of 0.16/0.17: it now receives a third `context` argument instead of the old `req`, and the auth token is read from `context.token` (not from a query param, and not passed positionally as `onAuth(token, request)`):
  ```ts
  class MyRoom extends Room {
    static async onAuth(token, options, context) {
      // context.token   -> the auth token sent by the client
      // context.headers -> request headers
      // context.ip      -> client IP
      const userdata = await JWT.verify(token);
      return userdata;
    }
  }
  ```
  A static `onAuth` is now the recommended form (runs before the room instance exists); the older instance-method `onAuth(client, options, context)` still works but is being deprecated in favor of the static form. Sources: https://docs.colyseus.io/auth/room, https://colyseus.io/blog/colyseus-016-is-here/, https://github.com/colyseus/colyseus/pull/657
- There is now also an optional `@colyseus/auth` module providing built-in JWT auth/anonymous/OAuth routes, separate from a bespoke Supabase-JWKS `onAuth` implementation; the plan's home-grown JWKS approach (verify a Supabase-issued JWT inside `onAuth`) is unaffected by this and remains a valid, supported pattern — `context.token` is exactly what a hand-rolled JWKS verifier would consume. Source: https://docs.colyseus.io/auth/module

**(b) Was the plan correct?**

- Version floor "0.16+" — correct but stale; current stable is 0.18.5, and code samples should target that.
- `setSimulationInterval`/`setPatchRate`/`allowReconnection`/`@colyseus/testing` API names — **correct, unchanged**.
- Server bootstrap shape and `.define(...).filterBy(...)` — **outdated**. The plan describes (implicitly, via `gameServer.define("match", MatchRoom).filterBy(...)`) the pre-0.17 `@colyseus/tools`-style API, which is soft-deprecated in favor of `defineServer`/`defineRoom`.
- `onAuth` — the plan's description ("verify JWT via JWKS") is directionally fine, but doesn't reflect the current three-argument static signature with `context.token`.

**(c) Replacement wording:**

- Line 21: change "Use Colyseus 0.16+ with `@colyseus/schema` v3" → "Use Colyseus 0.18+ with `@colyseus/schema` v5".
- Line 328: change `gameServer.define("match", MatchRoom).filterBy(["mode","code"])` → describe the room registration via `defineServer`/`defineRoom`:
  ```ts
  const server = defineServer({
    rooms: {
      match: defineRoom(MatchRoom).filterBy(["mode", "code"]),
    },
    // transport, express, etc.
  });
  ```
- Line 189 and the `index.ts` bootstrap description: replace "Colyseus server (WebSocket transport) with Express routes..." with a `defineServer({ rooms, transport, express })` sketch instead of implying a `new Server()`/`.listen()` shape.
- Line 449 (`MatchRoom.onAuth`): specify the current signature, e.g. `static async onAuth(token, options, context)`, and that the JWT to verify is `context.token`, not a positional `token` param from a raw request.

**(d) Sources:**

- https://registry.npmjs.org/colyseus/latest
- https://registry.npmjs.org/@colyseus/testing/latest
- https://docs.colyseus.io/migrating/0.17
- https://docs.colyseus.io/server
- https://colyseus.io/blog/colyseus-017-is-here/
- https://docs.colyseus.io/tools/unit-testing
- https://docs.colyseus.io/room
- https://docs.colyseus.io/room/reconnection
- https://docs.colyseus.io/auth/room
- https://colyseus.io/blog/colyseus-016-is-here/
- https://github.com/colyseus/colyseus/pull/657
- https://docs.colyseus.io/auth/module

---

## 3. `@colyseus/schema`

**Plan assumption** (line 21): "`@colyseus/schema` v3"; (line 144): "`shared` and `server` set `experimentalDecorators: true` and `useDefineForClassFields: false`, as required by `@colyseus/schema` decorators."

**(a) Current fact:**

- npm `@colyseus/schema` latest is **5.0.32** — the plan's "v3" is two majors behind. Source: https://registry.npmjs.org/@colyseus/schema/latest
- The legacy `@type()` decorator API is still supported in v5 and **still requires the same tsconfig settings** the plan lists: `experimentalDecorators: true` and `useDefineForClassFields: false`. This has not changed across v3→v4→v5 for decorator-based schemas. Source: https://github.com/colyseus/schema (README/CHANGELOG)
- However, v5 introduces a **new decorator-free authoring API** (`schema()` builder + `t.*` field constructors, e.g. `t.string()`, `t.number()`, `.default()`, `.optional()`) that runs in plain TypeScript/JavaScript with **no special compiler flags at all**. The project's own docs describe this as the direction they're moving, citing "ecosystem compatibility issues" with legacy decorators (esbuild/SWC/Vite friction) as the motivation. Both authoring styles produce an identical wire format, so it's a purely-additive, non-breaking option — not a forced migration. Source: https://github.com/colyseus/schema (README/CHANGELOG)
- Net: schema has **not** moved to TC39 standard decorators; it kept `experimentalDecorators`-style legacy decorators for backward compatibility and added an alternative that avoids decorators altogether.

**(b) Was the plan correct?** The tsconfig requirement (`experimentalDecorators: true`, `useDefineForClassFields: false`) is still correct today. The version number ("v3") is stale.

**(c) Replacement wording:**

- Line 21: "`@colyseus/schema` v3" → "`@colyseus/schema` v5".
- Line 144: keep the tsconfig requirement as-is (it's still accurate for the decorator-based API used elsewhere in the plan), but add a footnote that v5 also ships a decorator-free `schema()`/`t.*` builder API requiring no special tsconfig, which is worth considering if the `experimentalDecorators` requirement ever conflicts with other tooling (e.g. SWC/esbuild-based test runners) in `shared`/`server`.

**(d) Sources:**

- https://registry.npmjs.org/@colyseus/schema/latest
- https://github.com/colyseus/schema (README + CHANGELOG.md, master branch)

---

## 4. PixiJS

**Plan assumption** (line 21): "PixiJS v8"; (line 376): `Assets` bundle usage (`manifest.json` with named bundles); (line 493): `MeshRope` for cape secondary motion.

**(a) Current fact:**

- npm `pixi.js` latest is **8.20.1** — v8 is current stable. Source: https://registry.npmjs.org/pixi.js/latest
- `Application.init()` is async, exactly as the plan implies elsewhere (client-only Pixi bootstrap): you construct `new Application()` then `await app.init({ width, height, backgroundColor, ... })` before appending `app.canvas` to the DOM. This has been the v8 shape since launch and is unchanged. Source: https://pixijs.com/8.x/guides/basics/getting-started (via PixiJS docs; confirmed through search-indexed doc content since direct fetch 404'd on that path)
- `Assets.addBundle(name, assets)` and `Assets.loadBundle(name)` are both current v8 APIs — `addBundle` registers a bundle (array of `{alias, src}` or an alias→src map) at runtime, `loadBundle` loads a previously-registered (or manifest-declared) bundle by name. Source: https://pixijs.com/8.x/guides/components/assets/manifest, https://pixijs.download/v8.10.0/docs/assets.AssetsBundle.html
- `MeshRope` still exists under that exact name in v8, as one of four built-in `Mesh` subclasses (`MeshSimple`, `MeshPlane`, `MeshRope`, `PerspectiveMesh`), constructed from a texture plus an array of points. Source: https://pixijs.com/8.x/guides/components/scene-objects/mesh, https://pixijs.download/v8.2.5/docs/scene.MeshRope.html

**(b) Was the plan correct?** Yes on every point — v8 is current, `Assets` bundle API names match, `MeshRope` is unchanged.

**(c) Replacement wording:** None needed.

**(d) Sources:**

- https://registry.npmjs.org/pixi.js/latest
- https://pixijs.com/8.x/guides/basics/getting-started
- https://pixijs.com/8.x/guides/components/assets/manifest
- https://pixijs.download/v8.10.0/docs/assets.AssetsBundle.html
- https://pixijs.com/8.x/guides/components/scene-objects/mesh
- https://pixijs.download/v8.2.5/docs/scene.MeshRope.html

---

## 5. Supabase

**Plan assumption:** Mixed — line 157 and 478 already use `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` naming, but lines 440, 450, 461 refer to `service_role` by its legacy name, and line 448 assumes a JWKS endpoint at `.../auth/v1/.well-known/jwks.json`; line 454/467 assume an "anonymous sign-in" API; line 472 assumes a `supabase/setup-cli` GitHub Action.

**(a) Current fact:**

- Supabase **is** renaming/replacing the legacy `anon`/`service_role` JWT keys with new opaque, prefixed keys: **publishable key** (`sb_publishable_...`, replaces `anon`, safe to ship client-side since RLS still applies) and **secret key** (`sb_secret_...`, replaces `service_role`, carries `BYPASSRLS`, server-only). Both key systems currently work side by side; Supabase's own docs state legacy `anon`/`service_role` keys are being **deprecated by the end of 2026** (i.e., within months of this research date), and recommend using the new publishable/secret keys for anything built now. Sources: https://supabase.com/docs/guides/getting-started/api-keys, https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys, https://github.com/orgs/supabase/discussions/29260
- JWKS endpoint path is confirmed exactly as the plan assumes: `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`, returning public keys only, used to verify asymmetric (RS256/ES256) JWT signing keys; it returns nothing if the project isn't using asymmetric signing keys yet. Source: https://supabase.com/docs/guides/auth/signing-keys, https://supabase.com/docs/guides/auth/jwts
- `supabase.auth.signInAnonymously()` (and its option bag, e.g. `{ options: { captchaToken } }`) is the current, documented JS client API for anonymous sign-in, unchanged. Source: https://supabase.com/docs/reference/javascript/auth-signinanonymously, https://supabase.com/docs/guides/auth/auth-anonymous
- The GitHub Action is `supabase/setup-cli` (correct repo/action name), currently at **v3.0.0** (released ~July 2026), which switched to installing the CLI from the npm package rather than GitHub releases and dropped the `github-token` input. `uses: supabase/setup-cli@v1` still resolves (major-version tag), but the underlying implementation has changed; the plan's use of the action name is correct. Source: https://github.com/supabase/setup-cli/releases, https://github.com/supabase/setup-cli/blob/main/action.yml

**(b) Was the plan correct?**

- The plan is **already partially updated**: it uses `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` env var names (lines 156, 478) and calls out "secret key" explicitly in several places (D5, line 450) — this matches current Supabase guidance.
- But it's **inconsistent**: it still says "granted only to `service_role`" (line 440) and "`authenticated` and `anon` can't insert..." (line 461) using the legacy JWT-role names. Note these legacy names (`service_role`, `anon`, `authenticated`) are **Postgres roles / RLS policy role names**, which are unaffected by the API-key rename — the rename only affects the _API key_ used to authenticate as those roles, not the role names themselves inside SQL/RLS. So line 440/461 are not actually wrong, just potentially confusing next to the new key terminology; worth a clarifying note but not a correction.
- JWKS path, anonymous sign-in API, and `supabase/setup-cli` action name — all correct as written.

**(c) Replacement wording:** No functional corrections needed. Optional clarification to add near line 440/461: "`service_role`/`anon`/`authenticated` here are Postgres/RLS role names, distinct from the `SUPABASE_SECRET_KEY`/`SUPABASE_PUBLISHABLE_KEY` API keys used to authenticate as those roles — the 2026 key rename affects only the latter."

**(d) Sources:**

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://github.com/orgs/supabase/discussions/29260
- https://supabase.com/docs/guides/auth/signing-keys
- https://supabase.com/docs/guides/auth/jwts
- https://supabase.com/docs/reference/javascript/auth-signinanonymously
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://github.com/supabase/setup-cli/releases
- https://github.com/supabase/setup-cli/blob/main/action.yml

---

## 6. Turborepo

**Plan assumption:** Line 21 targets "pnpm 10"; line 140 defines `turbo.json` tasks; line 156 pipeline: `turbo prune @castle-clash/server --docker` → `pnpm install --frozen-lockfile` from `out/json` → copy `out/full` → `turbo build` → `pnpm deploy --filter=@castle-clash/server --prod /out`.

**(a) Current fact:**

- npm `turbo` latest is **2.10.13** — v2 is current stable (the plan doesn't state a `turbo` major explicitly, but the Docker/prune workflow it describes matches v2's documented behavior). Source: https://registry.npmjs.org/turbo/latest
- `turbo prune --docker` **still produces exactly the layout the plan assumes**: an output directory (default `./out`) containing `json/` (pruned `package.json` files, for the install layer) and `full/` (pruned source, for the build layer), plus a pruned lockfile — designed so `out/json` can be copied and installed against as a stable, infrequently-changing Docker layer, then `out/full` copied in afterward for the actual source. Source: https://turborepo.dev/repo/docs/reference/prune
- **pnpm is at v12.4.1**, not v10 as the plan's "Version notes" line states — this is a significant gap (two majors ahead). Source: https://registry.npmjs.org/pnpm/latest
- `pnpm deploy --legacy`: as of **pnpm 12.2.0**, `pnpm deploy` **no longer requires `injectWorkspacePackages`** — a linked workspace dependency is automatically rewritten to a `file:` dependency in a dedicated deploy lockfile, without needing `--legacy` or the `injectWorkspacePackages` setting. `--legacy` still exists as an escape hatch to force the old dedicated-lockfile-free behavior, but it's opt-in, not required. For pnpm 10.x specifically (which is what the plan names), the situation was the one described in the well-known GitHub pain point: `pnpm deploy` **did** require `injectWorkspacePackages: true` in `pnpm-workspace.yaml`, or explicit use of `--legacy`/`force-legacy-deploy`, to avoid `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`. Sources: https://pnpm.io/cli/deploy, https://github.com/orgs/pnpm/discussions/9015, https://github.com/pnpm/pnpm/issues/9386

**(b) Was the plan correct?**

- `turbo prune --docker` output layout (`out/json`, `out/full`) — **correct, unchanged**.
- pnpm version target "pnpm 10" — **stale**; current stable is pnpm 12.
- Implicitly, the plan's Docker pipeline (line 156) doesn't mention `--legacy` or `injectWorkspacePackages` at all for the `pnpm deploy` step — under pnpm 10 as literally stated, that step would likely fail with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE` unless `injectWorkspacePackages: true` is set in `pnpm-workspace.yaml`. Under the actually-current pnpm 12.2+, this is no longer necessary — `pnpm deploy` works out of the box.

**(c) Replacement wording:**

- Line 21: "Target Node 24 LTS and pnpm 10" → "Target Node 24 LTS and pnpm 12" (or whatever pnpm major is current when the plan is implemented — recommend pinning via `packageManager` field and checking `https://registry.npmjs.org/pnpm/latest` at implementation time rather than hardcoding a major in prose).
- Line 156: no change needed to the `pnpm deploy --filter=@castle-clash/server --prod /out` invocation itself under current pnpm (12.2+), since `injectWorkspacePackages` is no longer required. If the team pins to pnpm 10 or 11 instead, add: "set `injectWorkspacePackages: true` in `pnpm-workspace.yaml` (or pass `--legacy`) — required for `pnpm deploy` against workspace-linked packages prior to pnpm 12.2."

**(d) Sources:**

- https://registry.npmjs.org/turbo/latest
- https://turborepo.dev/repo/docs/reference/prune
- https://registry.npmjs.org/pnpm/latest
- https://pnpm.io/cli/deploy
- https://github.com/orgs/pnpm/discussions/9015
- https://github.com/pnpm/pnpm/issues/9386

---

## 7. Vitest

**Plan assumption:** Line 79 lists `vitest.workspace.ts` as a top-level config file; line 117-123 use plain Vitest for unit/integration tests; line 121 uses "Vitest browser mode (Playwright Chromium)" for render tests; line 207 installs "Playwright Chromium" in CI.

**(a) Current fact:**

- npm `vitest` latest is **5.0.0** — v5 is current stable. Source: https://registry.npmjs.org/vitest/latest
- **`vitest.workspace.ts` is deprecated** (since Vitest 3.2) in favor of a `projects` array inside the root `vitest.config.ts`. The two mechanisms are functionally equivalent; the separate workspace file/`workspace` terminology was deprecated partly because it collided with pnpm's own "workspace" concept. The docs state the workspace file "will be removed completely in a future major" (and v5 is that next major after the 3.2 deprecation, so a monorepo built fresh today should use `projects`, not a `vitest.workspace.ts` file). Source: https://vitest.dev/guide/projects, https://vitest.dev/blog/vitest-3-2.html
- **Browser mode provider packaging changed.** Automation providers (Playwright, WebdriverIO) are no longer bundled into `vitest`/`@vitest/browser` — install them as separate packages and pass the provider function into `test.browser.provider`. For Playwright: package name **`@vitest/browser-playwright`**, imported as `import { playwright } from '@vitest/browser-playwright'`, configured as:
  ```ts
  import { defineConfig } from "vitest/config";
  import { playwright } from "@vitest/browser-playwright";

  export default defineConfig({
    test: {
      browser: {
        provider: playwright(),
        enabled: true,
        instances: [{ browser: "chromium" }],
      },
    },
  });
  ```
  Source: https://vitest.dev/guide/browser/

**(b) Was the plan correct?**

- "Vitest browser mode (Playwright Chromium)" as a concept — correct, still exists.
- `vitest.workspace.ts` as a top-level config file (line 79) — **outdated**; should be a `projects` array in `vitest.config.ts`.
- The plan never names the browser provider package explicitly, so there's nothing wrong per se, but anyone implementing Phase 1/6 needs to know to install `@vitest/browser-playwright` (not assume it ships with `@vitest/browser` or `vitest` itself) and to set `test.browser.provider: playwright()` rather than a string like `provider: 'playwright'`.

**(c) Replacement wording:**

- Line 79: remove `vitest.workspace.ts` from the top-level file list; instead note that each package still has its own `vitest.config.ts` for local runs, and CI/`turbo run test` drives them via `projects: ["apps/*", "packages/*"]` inside a root `vitest.config.ts` (or by invoking each package's own config — either is compatible with Turborepo tasks).
- Line 121/207: add "(install `@vitest/browser-playwright` as a dev dependency and set `test.browser.provider: playwright()` in the client's `vitest.config.ts`)" alongside the existing "Vitest browser mode (Playwright Chromium)" description.

**(d) Sources:**

- https://registry.npmjs.org/vitest/latest
- https://vitest.dev/guide/projects
- https://vitest.dev/blog/vitest-3-2.html
- https://vitest.dev/guide/browser/

---

## 8. TypeScript (added after initial research — discovered while pinning `package.json`)

**Plan assumption:** Not stated explicitly as a version; the plan assumes a normal `tsc` toolchain compatible with `typescript-eslint`, `tsup`, and Vitest's type-aware tooling.

**(a) Current fact:**

- `typescript@latest` on npm is **7.0.2** — this is the Go-native compiler (codename "Corsa", CLI `tsgo`), GA'd 8 Jul 2026. It type-checks and emits identically to TypeScript 6.0, and still supports `experimentalDecorators`, `emitDecoratorMetadata`, `bundler`/`nodenext` module resolution, and `verbatimModuleSyntax`. Sources: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/, community coverage (InfoQ, InfoWorld) corroborating the GA date and scope.
- **7.0 ships with no programmatic compiler API** (`ts.createProgram`, `ts.transform`, `ts.factory`, etc.) — that returns in 7.1, expected around October 2026. Tools that call into the TS API directly (`typescript-eslint`, `ts-jest`, `ts-morph`, `@angular/compiler-cli`, `@vue/compiler-sfc`) cannot run against 7.0.
- `typescript-eslint@8.70.0`'s own `peerDependencies` pins `"typescript": ">=4.8.4 <6.1.0"` — confirmed directly via `npm view typescript-eslint peerDependencies`. It does not merely "not support" 7.x; its declared peer range excludes it outright.
- The `@typescript/typescript6` compatibility package exists specifically so projects that need the legacy API can keep running `tsc6` (a rebadged 6.x compiler) side-by-side with the `typescript` 7.x package.

**(b) Was the plan correct?** N/A — the plan didn't pin a version. But naively installing `typescript@latest` (as this session initially did in `package.json`) would have pulled 7.0.2 and broken `typescript-eslint` outright, since 7.0's peer-incompatible with any current type-aware ESLint setup.

**(c) Replacement/action taken:** Pinned `typescript` to `6.0.3` (latest stable 6.x, within `typescript-eslint`'s supported range) in the root `package.json`, and added a note to the plan's "Version notes" section. Revisit once `typescript-eslint` and `tsup`'s `.d.ts` bundling publish confirmed TypeScript 7.1 support.

**(d) Sources:**

- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://registry.npmjs.org/typescript (dist-tags: `latest` 7.0.2, `rc` 7.0.1-rc)
- `npm view typescript-eslint peerDependencies` (npm registry metadata, checked 2026-09-14)
- Community coverage corroborating the missing-API timeline: InfoQ ("Microsoft Releases TypeScript 7.0 with a Native Go Compiler"), Microsoft for Developers blog ("TypeScript 7 native preview in Visual Studio 2026")

---

## 9. corepack (found while writing the Dockerfiles)

**Plan assumption** (line 156): "**Server** (multi-stage): `node:24-alpine` + corepack → `turbo prune...`".

**(a) Current fact:** This session's own dev machine has Node 24 installed (distro package, not the official `nodejs.org` build) with no `corepack` binary at all — `corepack enable`/`corepack prepare` both failed with "command not found". pnpm had to be installed via `npm install -g pnpm@12.4.1` instead, using an explicit `--prefix` override since an env-set `npm_config_prefix=/usr/local` (not writable) otherwise shadowed the user-level `.npmrc` prefix. Corepack has been slated for removal from Node core in an upcoming major (community coverage, not independently re-verified for this entry) and isn't guaranteed present on every Node 24 build across distributions.

**(b) Was the plan correct?** Unverified either way for the official `node:24-alpine` Docker image specifically (this session couldn't run Docker to check) — but the failure mode is real and was hit directly on this machine's Node 24. Depending on corepack being present is a fragility risk either way.

**(c) Action taken:** Both `apps/server/Dockerfile` and `apps/client/Dockerfile` install pnpm and turbo via `npm install -g pnpm@12.4.1 turbo@2.10.13` instead of `corepack enable`, with an inline comment explaining why. This is a deviation from the plan's literal Dockerfile step, not just a version bump — flagged here for the same reason the other corrections are: so it's a recorded, deliberate choice rather than a silent one. If `node:24-alpine` turns out to ship corepack reliably, this could be simplified back once someone can build the images and confirm it.

**(d) Sources:**

- This session's own `corepack enable` / `corepack prepare pnpm@latest --activate` failures on the sandboxed dev machine (Node v24.18.0, distro-packaged).

---

## Summary table

| #   | Library            | Plan assumed                                                                           | Current reality                                                                                                                                                                                                                                                                                                                                                                                                       | Plan status                                                                                                |
| --- | ------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | React Router       | v8, `ssr:false`, `clientLoader`                                                        | v8.3.1 confirmed; all APIs unchanged                                                                                                                                                                                                                                                                                                                                                                                  | Correct                                                                                                    |
| 2   | Colyseus           | 0.16+, `.define().filterBy()`, `onAuth`                                                | 0.18.5; bootstrap moved to `defineServer`/`defineRoom` (old style soft-deprecated); `onAuth(token, options, context)` with `context.token`                                                                                                                                                                                                                                                                            | Needs update (version + bootstrap API + onAuth signature)                                                  |
| 3   | `@colyseus/schema` | v3, tsconfig flags                                                                     | v5.0.32; same tsconfig flags still required for decorators; new decorator-free API added                                                                                                                                                                                                                                                                                                                              | Needs version bump only                                                                                    |
| 4   | PixiJS             | v8, `Application.init()`, `Assets` bundles, `MeshRope`                                 | v8.20.1; all APIs unchanged                                                                                                                                                                                                                                                                                                                                                                                           | Correct                                                                                                    |
| 5   | Supabase           | publishable/secret keys, JWKS path, anonymous sign-in, `setup-cli`                     | All confirmed current; legacy `anon`/`service_role` keys deprecating by end of 2026                                                                                                                                                                                                                                                                                                                                   | Correct (already ahead of the curve on key naming)                                                         |
| 6   | Turborepo/pnpm     | `turbo prune --docker` layout, pnpm 10                                                 | turbo 2.10.13, layout unchanged; pnpm is actually 12.4.1, and `injectWorkspacePackages` no longer required as of pnpm 12.2                                                                                                                                                                                                                                                                                            | Needs pnpm version update                                                                                  |
| 7   | Vitest             | `vitest.workspace.ts`, browser mode + Playwright                                       | vitest 5.0.0; workspace file deprecated in favor of `projects` in `vitest.config.ts`; Playwright provider is now the separate `@vitest/browser-playwright` package                                                                                                                                                                                                                                                    | Needs update (workspace file + provider package name)                                                      |
| 8   | TypeScript         | not stated explicitly; plan implies a normal `tsc`/programmatic-API toolchain          | `typescript@latest` on npm is **7.0.2**, the Go-native ("Corsa"/`tsgo`) compiler (GA July 2026). Same type-checking/emit as 6.0, still supports `experimentalDecorators`, `bundler`/`nodenext` resolution, `verbatimModuleSyntax`. But 7.0 ships **no programmatic compiler API** until 7.1 (~Oct 2026), and `typescript-eslint@8.70.0`'s peer range is `typescript: ">=4.8.4 <6.1.0"` — it does not support 7.x yet. | **Pin to `typescript@6.0.3`**, not `latest`, until `typescript-eslint`/`tsup` confirm 7.1 support.         |
| 9   | corepack           | plan's Dockerfile step assumes `node:24-alpine` + `corepack enable` gets a pinned pnpm | This session's own Node 24 (distro-packaged) has no `corepack` binary at all; unverified for the official `node:24-alpine` image specifically (no Docker available to check)                                                                                                                                                                                                                                          | Dockerfiles install pnpm/turbo via `npm install -g` instead, to avoid depending on corepack's availability |
