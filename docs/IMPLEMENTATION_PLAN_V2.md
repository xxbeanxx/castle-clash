# Castle Clash — Implementation Plan v2: From "Deployed" to "Worth Playing"

Drafted 2026-09-19, after the first fully green production deploy (`v1.1.0`). This continues
`docs/IMPLEMENTATION_PLAN.md` (Phases 1–10, all landed). It does **not** restate architecture — the
isomorphic-sim boundary (ADR 0001), the server-authoritative netcode, and the Terraform/Azure
deploy pipeline stay as they are. Phase numbering continues at 11.

**Theme:** the engine is real (deterministic sim, combat, six arenas, hazards, power-up draft,
Supabase persistence, cosmetics, production deploy). Everything a _player_ touches is a placeholder.
This plan fixes the player-facing surface: front door, accounts, controls on every device, art,
sound, and a game that is playable when nobody else is online.

---

## 0. What the tree actually shows (checked 2026-09-19)

Facts this plan is built on. Each was read from the repo, not assumed.

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | `/` renders `<p>TICK_RATE: 60</p>` | `apps/client/app/routes/home.tsx` | Item 1. There is no public page at all. |
| F2 | A "Continue with Google" button **already exists** (and Discord) | `routes/login.tsx`, `auth/supabase.ts` | Item 2 is not "add a button". The gaps are below (F3–F5). |
| F3 | Supabase **auth settings are deliberately not in Terraform** — they live in the dashboard | `infra/terraform/supabase.tf` comment | Whether Google is enabled on the hosted project is **unverified**. Discord likely isn't. A dead button may be shipping. |
| F4 | `signInWithOAuth()` is called even when the current session is an anonymous guest | `auth/supabase.ts` | Per Supabase's model that creates a **new** user rather than linking; the guest's stats/unlocks are orphaned. `verifyToken.ts`'s own comment assumes linking ("same `userId` survives"). The code never calls `linkIdentity`. |
| F5 | OAuth always returns to `/login` then `navigate("/lobby")`; deep links (`/play/new?code=ABC123`) are lost through login | `routes/login.tsx` | A friend clicking a private-room link and signing in lands in the lobby, not the room. |
| F6 | `profiles.display_name` exists but **nothing ever sets it**; `ResultsOverlay` prints raw player ids | `supabase/migrations/…profiles.sql`, `ui/ResultsOverlay.tsx` | Players are anonymous strings everywhere. |
| F7 | Input is `KeyboardInput` only. It samples held-key state once per 60 Hz tick | `game/input/KeyboardInput.ts` | No touch/gamepad. Also a latent bug: a press+release between two samples is **lost** (a touch tap is ~50–100 ms, but any sub-16.7 ms tap on any device drops). |
| F8 | Pixi is initialised as `app.init({ resizeTo, backgroundColor })` — no `resolution`, `autoDensity`, `antialias`, or `roundPixels` | `GameClient.ts:260` | On a DPR-3 phone the canvas renders at CSS-pixel resolution and is upscaled: blurry. Wrong for pixel art regardless. |
| F9 | `Camera` has a hard-coded 1280×720 viewport and fractional zoom (0.5–1) | `game/render/Camera.ts` | Fractional zoom shimmers pixel art; a phone's 20:9 aspect isn't handled. |
| F10 | Every player renders as a **32×32 tinted square**; the sim hitbox is **28×48** | `render/PlayerRects.ts` vs `config/game.ts` | What you see is not what you hit. Art must be authored to the hitbox. |
| F11 | Zero art, audio, fonts, or asset pipeline exist (`public/` holds only `favicon.ico`). Phase 4/6/9 deviation notes each deferred it to "a future art phase" | `docs/research/phase{4,6,9}-*-deviation.md` | Item 3 is a from-scratch pipeline, not a reskin. Weapons have **no visual at all**; weapon styles are persisted but invisible. |
| F12 | `MIN_PLAYERS = 2`, no bots, no solo mode | `config/game.ts`, `MatchRoom.ts` | On a fresh public site a lone visitor **cannot play**. This is the highest-impact gap outside your list. |
| F13 | Sudden death only sets a flag; no shrink or damage ramp | `config/game.ts` comment | A stalemate round runs to the time limit with no pressure. |
| F14 | CSP is `default-src 'self'`; `img-src 'self' data: blob:`; no `font-src` | `apps/client/docker/entrypoint.sh` | Fonts and atlases must be **self-hosted**. Google Fonts / third-party CDNs will be blocked. |
| F15 | **`CLAUDE.md` says "Phase 3 … done … there's no way to take or deal damage."** The tree is at Phase 10 | `CLAUDE.md` | Stale guidance is actively misleading future sessions. Fixed first (Phase 11 step 1). |
| F16 | `leaderboard`, `stats`, `loadout`, `lobby`, `play` are all `clientLoader`-guarded; `/` and `/login` are the only public routes | `routes/*.tsx` | Nothing is shareable or crawlable. |

**Not verified (each phase starts by resolving its own):** the hosted Supabase project's current
Google/Discord config; whether React Router v8 SPA-mode `prerender` behaves as I expect; the exact
`linkIdentity` prerequisites (manual-linking toggle). Per repo convention each becomes a
`docs/research/phaseN-*.md` note _before_ code.

---

## 1. Ordering and parallel tracks

```
Track A (start day 0, long lead):  Art sourcing / commissioning  ─────────────►  feeds Phase 15
Track B (engineering):
  P11 Foundations + landing ──► P12 Accounts (Google) ──► P13 Render surface + mobile
        ──► P14 Never-empty game (bots, first-run) ──► P15 Pixel art ──► P16 Audio + feel ──► P17 Hardening
```

Why this order, not the order you listed:

- **Landing (P11) first** — it's small, unblocks everything visible, and produces the privacy/terms
  pages Google's OAuth consent screen requires (P12 dependency).
- **Mobile (P13) before art (P15)** — both need the same fix to the render surface (F8/F9). Deciding
  the virtual-resolution model once, in P13, means art is authored against a settled target rather
  than redrawn later.
- **Bots (P14) before art** — art is the longest phase; you want a game that is playable solo _while_
  you evaluate it. Also, F12.
- **Art sourcing is Track A**, not a phase: an artist's lead time or a pack's licensing review should
  start now so P15 isn't blocked on it.

Sizes are relative effort, not dates: S ≈ days, M ≈ 1–2 weeks, L ≈ 2–4 weeks, XL ≈ 1+ month.

---

## Phase 11 — Foundations and the Front Door (M)

**Objective:** `/` becomes a real, public, shareable landing page inside a coherent UI system, and
the repo's own docs stop lying.

### Implementation steps

1. **Docs debt.** Rewrite `CLAUDE.md`'s status paragraph to the real state (Phases 1–10 landed;
   production live). Mark the Appendix B items of the v1 plan that were resolved. Add this file to
   `CLAUDE.md`'s pointer list.
2. **UI foundation** (`apps/client/app/ui/`, `app.css`): CSS custom-property design tokens (color,
   spacing, radius, z-index, type scale), a dark medieval theme, and a small primitive set
   (`Button`, `Panel`, `Modal`, `Field`, `Nav`). Replace the inline `style={{…}}` blocks in `lobby`,
   `login`, `loadout`, `stats`, `leaderboard`, `CombatHud`, `DraftOverlay`, `ResultsOverlay`. Fonts
   are **self-hosted** (F14): one pixel display face + one legible body face, both OFL-licensed,
   `font-display: swap`, preloaded.
3. **App shell:** persistent header (logo, Play, Leaderboard, account menu — placeholder until P12),
   footer (privacy, terms, GitHub, `SERVER_VERSION`), a real `ErrorBoundary`, a 404 route, and a
   branded `HydrateFallback` instead of `Loading…`.
4. **Landing (`/`), public:**
   - Hero with the one primary action: **Play now** → guest sign-in + quick play in one click (no
     form). Secondary: **Sign in**.
   - "How it works" in three beats (fight / draft a power-up each round / first to 3 rounds), with
     the control scheme for keyboard **and** touch (touch art arrives in P13).
   - Arena and weapon showcase (data-driven from `ARENA_IDS` / `WEAPON_DEFS` so it can't drift from
     the game; static rects until P15 supplies art).
   - Live proof of life: "N players online · M matches played" from a small public
     `GET /stats` on the server (rooms/clients from `matchMaker.stats`; cache 5 s; rate-limited;
     CORS to the client origin). Hidden if the fetch fails — never an error state on the front page.
   - Top-10 leaderboard teaser (requires the `leaderboard` view to be anon-readable — **decision D3**).
5. **Static pages:** `/how-to-play`, `/privacy`, `/terms`, `/about`. Plain content routes.
6. **Metadata:** per-route `<title>`/description, Open Graph + Twitter card, real favicon set,
   `theme-color`, canonical URL. Evaluate React Router `prerender` for the static routes (SPA mode
   with `ssr: false` supports a `prerender` list — confirm against v8 docs in the research note);
   fall back to hand-written `<meta>` in `root.tsx` if it doesn't.
7. **Lobby redesign** (`/lobby`): card-based Play hub — Quick play, Create private room (arena
   picker), Join by code — plus Loadout / Stats / Leaderboard as first-class destinations rather
   than three unstyled buttons. No new server logic.
8. **Route auth model:** make `/`, `/leaderboard`, `/how-to-play`, `/privacy`, `/terms`, `/about`
   public; keep `lobby`/`play`/`loadout`/`stats` guarded, but change `requireSession` to redirect to
   `/login?next=<original path>` (consumed in P12, fixing F5).

### Testing strategy (gate to Phase 12)

- Existing route tests updated for the new markup; add landing tests (renders with `/stats`
  failing; Play-now click calls guest sign-in then navigates).
- Playwright: `landing.spec.ts` — from a cold browser, `/` → **Play now** → in a room within
  2 clicks and no typing.
- Lighthouse CI budget on `/`: performance ≥ 90, accessibility ≥ 95, LCP < 2.5 s on throttled
  mobile. Total JS on `/` should not include Pixi (route-level code splitting: Pixi loads only on
  `/play` and `/loadout`).
- **Gate:** landing is deployed to staging, passes the budget, and a stranger can understand the
  game and start playing without an account.

### CI/CD integration

- Add the Lighthouse step to `ci.yaml`'s `browser` job (or a new `web-quality` job) against the
  built client. `/stats` gets a route test and an entry in the deploy smoke test.

---

## Phase 12 — Accounts: Google Login Done Properly (M)

**Objective:** Sign in with Google works in production, a guest upgrading keeps their progress, and
players have names.

### Implementation steps

1. **Research note** `docs/research/phase12-supabase-google-oauth.md`: confirm against current
   Supabase docs (a) `linkIdentity()` semantics and whether "manual linking" must be enabled;
   (b) behavior when the Google identity already belongs to another user
   (`identity_already_exists`); (c) the Management API's partial-update route for auth config
   (vs. the `supabase_settings` full-config diff problem that `supabase.tf` already documents);
   (d) Google consent-screen requirements (scopes `openid email profile` need no app verification,
   but the app must be "In production", with an authorized domain plus privacy/terms URLs — which is
   why P11 ships those pages first).
2. **Google Cloud side (manual, once):** project → OAuth consent screen (External, In production,
   authorized domain `atomic-nucleus.com`) → Web OAuth client with redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`. This is the one step Terraform cannot own
   (standard web OAuth clients have no Terraform resource). Deliver it as a **`wizard`-skill
   script** so it is repeatable, with the client secret captured straight into a Terraform variable
   / GitHub secret, never a file.
3. **Supabase config:** enable Google; set client id/secret; add `/auth/callback` to the redirect
   allow-list for staging and prod origins. Decision **D2**: apply through the Management API from a
   `terraform_data` + script (keeps "nothing set by hand", matches the repo's philosophy) vs. a
   documented dashboard step in `docs/hosting.md`. Recommended: the API script, scoped to only the
   keys we own so it never reads or clobbers the rest of the auth config.
4. **Correct the stale comment** in `supabase.tf` claiming `onAuth` accepts only anonymous guests
   (`verifyToken.ts` accepts any valid token and just exposes `isAnonymous`).
5. **Client auth flow** (`auth/supabase.ts`, still the only supabase-js importer):
   - `signInWithGoogle()`: if the current session `is_anonymous`, call **`linkIdentity`** (upgrade,
     same `userId`, stats preserved — fixes F4); otherwise `signInWithOAuth`.
   - Identity-collision handling: if the Google account already exists, explain, offer "sign in to
     that account" (the guest's progress is discarded — say so, require confirmation).
   - New `/auth/callback` route that exchanges the session and redirects to the sanitised `next`
     param (same-origin paths only — open-redirect guard) — fixes F5. Deep links survive login.
6. **Discord:** either configure it end to end (same steps, second provider) or **remove the
   button** until it is. A visible dead button is worse than none. Recommended: remove for now.
7. **Guest → account nudge:** after a guest's first completed match, a dismissible "Save your
   progress" prompt (Google / magic link). Never blocks play.
8. **Display names:** first sign-in (non-guest) and an editable field in a new `/account` route;
   validate against the existing `unique citext` column (3–16 chars, allow-list charset, a small
   profanity filter, friendly duplicate error). Guests get a generated name ("Guest-7F3A"). Server
   reads the name at `onJoin` from `PlayerRepository`, adds `PlayerState.name`; `ResultsOverlay`,
   HUD, and the leaderboard show it instead of ids (fixes F6). This is a schema change (shared +
   server + client together).
9. **Account menu** in the header: name, Loadout, Stats, Sign out. Sign out returns to `/`.

### Testing strategy (gate to Phase 13)

- Unit: `signInWithGoogle` branching (anonymous → `linkIdentity`, otherwise `signInWithOAuth`),
  collision path, `next`-param sanitiser (rejects `//evil.com`, `https://…`, `javascript:`).
- pgTAP: display-name constraints and RLS (can update own name only).
- Contract test: `PlayerRepository` name read against both implementations.
- **Live verification, real browser, real Google** (per repo practice — tests mock around the real
  bugs): guest plays a match → signs in with Google → same stats row, same unlocks; sign in from a
  second browser → collision message; private-room link → login → lands in the room.
- **Gate:** the scenario above passes in production and is recorded in a research note.

### CI/CD integration

- The Google flow can't run in CI; keep the deterministic parts (unit + pgTAP + local-Supabase e2e
  with email/anonymous) in CI and add a **manual pre-release checklist** in `docs/hosting.md`.
- Terraform README documents the new secrets and the one manual Google step.

---

## Phase 13 — Render Surface and Mobile Controls (L)

**Objective:** the game is fully playable, and looks correct, on a phone in landscape. Also settles
the render-scaling model that Phase 15's art depends on.

### Implementation steps

1. **ADR 0002: render surface** (decide before any code). Problem: pixel art needs integer pixel
   scaling; the camera currently zooms fractionally (F9); phones are 20:9 with DPR 2–3.
   Recommendation:
   - Render the world to a fixed **virtual resolution of 640×360** (1 art pixel = 2 world units; the
     28×48 hitbox is ≈14×24 art pixels, TowerFall/Nidhogg-class density), `scaleMode: "nearest"`.
   - Present with the **largest integer scale that fits in physical pixels** (`floor` of
     `devicePixelRatio × CSS size / 640`), centered.
   - **Overscan:** arenas are 1280×720 (checked: all but Dungeon, 1280×420); on ultra-wide screens the
     surplus shows background/parallax art rather than black bars. The sim is untouched.
   - Camera: drop fractional zoom for pixel-snapped panning; where multiple players spread wider than
     the view, allow one discrete zoom step (×1 ↔ ×½ of an integer step) instead of a continuous one.
   - Alternative to prototype and compare (`prototype` skill): 1280×720 virtual with 1:1 art. Bigger
     sprites, more detail per character, but more art labor and worse on phones. The spike decides.
2. **Pixi init:** `resolution: min(devicePixelRatio, 2 or 3)`, `autoDensity`, `antialias: false`,
   `roundPixels: true`, `powerPreference`. Handle resize/orientation change and container 0-size.
3. **`Camera`** takes the real container size (not the 1280×720 constant) per ADR 0002.
4. **Input abstraction.** `InputSource { attach(); detach(); sample(): number }`; `KeyboardInput`
   becomes one implementation; `CompositeInput` ORs any number of sources. `GameClient` depends only
   on the interface. Lives in `game/input/` (no React — oxlint enforces).
5. **Fix the lost-tap bug (F7)** for all sources: a press latches for at least one sample
   (`pressedSinceLastSample` OR'd with `held`, cleared after sampling). Regression test with
   keydown+keyup between two samples.
6. **`TouchInput`** (pure, in `game/input/`): pointer-id → control map, multi-touch, deadzone,
   `pointercancel`/`lostpointercapture`/`visibilitychange` release everything (no stuck inputs).
7. **`TouchControls`** (React DOM overlay in `app/ui/`, writes into `TouchInput`; DOM rather than
   Pixi for real pointer capture and accessibility):
   - Left thumb: **floating stick** → LEFT/RIGHT, flick down → DOWN (so DOWN+JUMP drop-through works).
   - Right thumb, arc of buttons: **Jump** (largest), **Light**, **Heavy**, **Block** (hold),
     **Dodge**. Minimum 48 px targets, thumb-reach zone, ≥ 40% idle opacity.
   - `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`,
     `overscroll-behavior: none`, context-menu suppressed; `dvh` and `env(safe-area-inset-*)` for
     iOS. No double-tap zoom.
   - Shown when `(pointer: coarse)` or on first touch (hybrids); keyboard hides it. Settings: size,
     opacity, left-handed swap (localStorage, wrapped in try/catch).
   - Optional `navigator.vibrate` haptics on Android (iOS Safari doesn't support it; don't depend on
     it).
8. **Landscape handling:** portrait shows a "rotate your device" screen (iOS Safari can't lock
   orientation; Android can only inside fullscreen). Add a Fullscreen button (not on iPhone Safari,
   which lacks the API — hide by feature detection) and **PWA manifest** (`display: standalone`,
   landscape) so "Add to Home Screen" removes browser chrome — the biggest practical iOS win.
9. **Responsive UI:** HUD, `DraftOverlay` (touch-sized cards, no hover-only affordances),
   `MatchBanner`, `ResultsOverlay`, lobby, loadout at 800×360 (small landscape phone) through 4K.
10. **Lifecycle:** mobile browsers suspend WebSockets when backgrounded. Verify `GameClient`'s
    fixed-step accumulator clamps after a long `requestAnimationFrame` gap (no catch-up spiral), and
    that `reconnection.ts`'s token flow recovers on `visibilitychange` with a "Reconnecting…" overlay.
11. **Gamepad** (small once step 4 exists): Gamepad API source, standard mapping, hot-plug.
12. **Perf budget:** 60 fps on a mid-range Android (Pixel 6a-class) and iPhone 12-class; cap DPR at 2
    if fill-rate bound. Report frame time in the E2E debug hook.

### Testing strategy (gate to Phase 14)

- `TouchInput` unit tests: two simultaneous pointers, pointer leaves control, cancel releases,
  deadzone edge cases. Property test (`fast-check`, already in use) that any pointer sequence ends
  with zero bits held after all pointers lift.
- Vitest browser mode: `CompositeInput` + latch behavior; canvas integer-scale math for a table of
  (CSS size, DPR) pairs — pure function, exhaustively tested.
- Playwright device emulation (`devices["Pixel 7"]`, `["iPhone 14 Landscape"]`, `hasTouch`): drive
  `TouchControls`, assert movement/attack via `window.__CC_DEBUG__` (the hook already exists under
  `VITE_E2E`). A two-context test: one touch, one keyboard, complete a match.
- **Manual real-device checklist** (no CI substitute): iOS Safari, iOS home-screen PWA, Android
  Chrome — controls feel, no stuck inputs on multi-touch, no scroll/zoom leaks, notch safe areas,
  background/foreground reconnect. Record results in a research note.
- **Gate:** a person completes a full match on a phone against a desktop player, and it is playable
  rather than merely functional.

### CI/CD integration

- Add mobile-emulation projects to `e2e/playwright.config.ts`. Pure-function scaling tests run in
  the normal `verify` job.

---

## Phase 14 — A Game You Can Play Alone: Bots, First-Run, Match Flow (L)

**Objective:** a first-time visitor is fighting within seconds, whether or not anyone else is online
(F12), and matches end and restart gracefully.

### Implementation steps

1. **Server-side bots.** A `BotController` produces `InputFrame`s into the same `InputQueue` a human
   would, so the sim, netcode, and determinism stay untouched (ADR 0001 holds). Start from
   `shared/testing/bots/scripted.ts`; add a small behavior model (approach, spacing, attack/block/
   dodge with reaction delay and error rate), three difficulty tiers. Bots are flagged
   (`PlayerState.isBot`), draft power-ups via the existing auto-pick, and are **excluded from
   persistence** (`record_match_result` already skips `mode = 'smoke'`; add `'practice'`), leaderboard,
   and unlock progress.
2. **Practice mode** (lobby + landing): "Practice vs bot", chosen arena and difficulty, no waiting.
3. **Quick-play backfill:** after N seconds alone in a public lobby, offer "Play a bot while you
   wait" (never silently — decision **D4**); if a human joins mid-countdown, the bot is dropped.
4. **First-run tutorial:** a short guided arena on the testbed with a passive dummy — move, jump,
   drop through, light/heavy, block, dodge — with prompts that are keyboard- or touch-aware. Skippable;
   shown once (localStorage) and reachable from `/how-to-play`.
5. **Waiting room / pre-match:** player list with names and cosmetics, ready state, host controls for
   private rooms, arena selection (resolves v1 Appendix B #2 — decision **D5**), shareable invite link
   (`/play/new?mode=private&code=…` — works through login thanks to P12).
6. **Post-match:** "Play again" (same room, same players) and "Back to lobby"; results screen uses
   names, not ids, and shows unlocks earned.
7. **Sudden death, for real (F13):** thread a damage multiplier (or shrinking hazards) through
   `resolveCombat` per the guidance already written in `config/game.ts`'s comment, with tests in
   `combat/resolve.test.ts` and `match/phase.test.ts`.
8. **Spectating** a full or in-progress room (schema already carries `spectator`), as a low-cost
   companion: watch, then join the next round.

### Testing strategy (gate to Phase 15)

- Bot determinism: seeded bot vs bot runs are reproducible (`SimHarness`); TTK bands from
  `combat/ttk.test.ts` extended for bot tiers so difficulty is a measured property, not a guess.
- Server test: a practice match runs to completion with one human and N bots, persists nothing,
  and never blocks room disposal.
- Playwright: cold visit → Practice → play → results → Play again, with no second human.
- **Gate:** a brand-new visitor, alone, is in a fight in under 10 seconds and can finish a match.

### CI/CD integration

- Bots join the load-test harness as the load generator (replacing hand-rolled clients).
  `nightly.yaml` runs a bot-vs-bot balance report.

---

## Phase 15 — Pixel Art (XL)

**Objective:** replace every rectangle with cohesive, animated pixel art, authored to the sim's
hitboxes and frame data, with a pipeline that keeps art and code from drifting.

**Honest scoping note.** I can build the pipeline, the renderer, the animation logic, the tests, and
placeholder art good enough to prove the plumbing. I cannot reliably produce _beautiful_ hand-crafted
pixel art myself. The art itself needs an artist, a purchased/licensed pack, or AI-assisted output
that a human cleans up. That is Track A, and decision **D1** is the most consequential one in this
plan.

### 15.0 — Art bible and vertical-slice spike (gate before committing to the full set)

1. **Art bible** (`docs/art/BIBLE.md`): ADR-0002 scale, one shared limited palette (≈32–48 colors),
   outline style, light direction (top-left), sprite anchoring (feet bottom-center), canvas sizes,
   naming, animation tag conventions, tint-mask rules, license/provenance log for every asset.
2. **Vertical slice:** one knight (idle, run, jump, light attack, hit-stun) + one arena (Colosseum,
   tiles + parallax) + one hazard, in-engine, viewed on a phone and a 4K monitor. If it doesn't look
   good here, stop and fix the direction before producing 200 more frames.

### 15.1 — Asset pipeline

3. **Sources in-repo** (`art/**/*.aseprite`), exports committed under `apps/client/public/assets/`
   (Aseprite sheet + JSON hash, which Pixi v8 reads natively, with animation tags → `animations`).
   Exports are committed rather than generated in CI (Aseprite isn't in CI).
4. **Loader:** Pixi `Assets` bundles per scope (`core`, `knight`, `ui`, one per arena, lazy), a real
   **loading screen with progress** (deferred since Phase 6). Global `scaleMode: "nearest"`. Atlases
   are same-origin, so the CSP (F14) needs no change; pixel fonts as `BitmapFont` in-canvas.
5. **`assets:check`** (the step v1 planned but never built), in CI: every clip name referenced by
   `knightAnimation.ts` exists; every catalog `textureKey` exists; every arena and hazard kind has
   art; per-bundle byte budget (initial load ≤ ~3 MB, arena bundles ≤ ~1 MB each — tune after the
   slice); frame counts and pivots consistent with the bible.

### 15.2 — Knights and weapons

6. **`viewmodel/knightAnimation.ts`** (pure): `(action, actionTick, weapon, velocity, grounded) →
   {clip, frame}`. Attack clips are authored so **startup frames are the anticipation, active frames
   are the strike, recovery frames the follow-through**, mapped tick-for-tick to
   `combat/weapons.ts` frame data. `PlayerState.actionTick` is already synced (checked), so no
   schema change is needed for this.
7. **`render/KnightView.ts`:** layered synced `AnimatedSprite`s — cape (behind), body (tint primary),
   trim (tint secondary), helmet, weapon — flipped by `facing`. Cosmetics move from `tint` indicator
   rects to real `textureKey` layers (replacing the Phase 9 placeholder); weapon styles finally get a
   visual because weapons finally have one (F11).
8. **Tint approach** (spike, **D6**): Pixi multiply-tint on greyscale masks is the cheap default;
   if colors go muddy, a palette-ramp shader keeps the limited palette crisp.
9. **Resolve the Phase 9 tint deviation:** add a real "customized" sentinel to `player_loadouts`
   (migration, expand/contract per the repo's rule) so the match body can use `tintPrimary` instead
   of `colorSeed`. Add a name plate + color ground-marker so two identically tinted players stay
   distinguishable.
10. **Animation set:** idle, run, jump rise/fall/land, drop-through, light ×2 (chain), heavy, air
    light, block, block-stun, hit-stun, guard-broken, dodge, KO — per weapon where it changes the
    silhouette. Budget this early; it is the bulk of the labor (states × weapons × frames).

### 15.3 — Arenas and hazards

11. **Geometry stays the single source of truth.** Art is _derived from_ `ArenaDefinition`: solids
    and platforms are **auto-tiled** (blob/9-slice) from their AABBs, so a collision change can never
    disagree with what's drawn. Per arena: a tileset, 2–4 parallax background layers, animated props
    (torches, banners), all in an `arenaTheme` keyed by arena id.
12. **Hazard art** for all five kinds, with the states the sim already exposes: FireZone (animated
    flames), BreakableFloor (intact/cracked/broken), KillZone (spikes / void / lava per arena),
    TimedTrap (warn → active), CollapsingPlatform (shake → fall).

### 15.4 — FX and UI skin

13. **`render/Fx.ts`** (planned in v1 Phase 4, never built): hit sparks, block sparks, guard-break
    burst, dodge after-image, run/land dust, death poof, ring-out fall. Pooled sprites, no
    allocation per hit. Hitstop is **visual-only** (freeze/shake the sprites) — the sim must not
    change (ADR 0001).
14. **UI skin:** 9-slice pixel panels/buttons, HP/stamina bar frames, icons for the 18 power-ups,
    weapon icons, cosmetic thumbnails, landing-page hero art, real logo. The DOM UI (P11 tokens) and
    the in-canvas UI share one palette.

### Testing strategy (gate to Phase 16)

- Pure tests: every `ActionState × WeaponId` maps to a clip that exists, with `frame < clipLength`;
  active-window frames line up with `AttackDef.hitboxes` tick offsets (a test that fails if frame
  data changes without the animation being retimed).
- Vitest browser mode (already used for `PlayerRects`): `KnightView` layer sync, flip, tint, cosmetic
  swap; auto-tiler output on every arena, including `validate.ts`'s fixtures.
- **Playwright visual regression** (deferred in Phase 6): deterministic seeded match, screenshots per
  arena and per hazard state, committed baselines, `update-snapshots` label workflow.
- **Gate:** every arena, knight state, and hazard renders from art with no placeholder rect visible,
  the asset budget passes, and a human confirms it looks right on phone and desktop. Art-look
  approval is inherently human; make it an explicit sign-off, not an assumption.

### CI/CD integration

- `assets:check` in `verify`; visual regression in `e2e.yaml`; bundle-size report on PRs.

---

## Phase 16 — Audio and Game Feel (M)

**Objective:** hits feel like hits. Right now combat feedback is a tint change.

### Implementation steps

1. **Audio engine** (client only, no React below `app/game/**`): SFX bus and music bus, pooled
   voices, positional pan by screen x, master/SFX/music volume. Mobile autoplay policy: the
   `AudioContext` is unlocked on the first user gesture (the **Play now** click is already one).
   Mute state persists (localStorage, try/catch).
2. **SFX set:** swing (per weapon), hit, block, guard-break, dodge, jump/land, footsteps, hazard
   warn/trigger, KO, ring-out, UI click/hover, countdown ticks, round win/lose, draft pick. Music:
   menu loop, one or two battle loops, a sudden-death intensifier. Source per **D1**-style decision:
   CC0/licensed (log provenance like art) or commissioned.
3. **Game feel, all client-side and driven by existing sim events:** hitstop, screen shake scaled by
   damage (`CameraController` already shakes), brief camera punch on KO, damage flash, low-HP
   vignette. Every intense effect has a **reduce-motion** switch and respects
   `prefers-reduced-motion`; no rapid full-screen flashing (photosensitivity).
4. **Damage/telegraph readability:** attack wind-up glints, stamina-low warning, guard-break cue.

### Testing strategy (gate to Phase 17)

- Audio behind an interface with a fake in tests; unit tests for event → sound mapping and voice
  pooling limits. Autoplay-unlock verified in a real mobile browser (manual checklist).
- **Gate:** playtest with the sound off vs on; combat is legible either way (audio reinforces, never
  carries information alone — accessibility).

---

## Phase 17 — Hardening, Settings, and Accessibility (M)

**Objective:** a public launch does not embarrass you.

### Implementation steps

1. **Settings screen** (`/settings` + in-game pause overlay): volume, key remapping, touch layout,
   reduce motion, screen-shake amount, gamepad bindings. Persisted locally; signed-in users may sync
   later (out of scope).
2. **Accessibility:** full keyboard navigation of menus, visible focus rings, ARIA on overlays
   (`role="dialog"`, focus trap for `DraftOverlay`/`Modal`), contrast ≥ WCAG AA on the token
   palette, colorblind-safe status indicators (never color alone), screen-reader-friendly landing.
3. **Connection UX:** turn server error strings ("server is draining", "at its room capacity",
   "missing auth token") into friendly, actionable messages; latency indicator; automatic
   reconnect with backoff; clear "server full, retrying" state.
4. **Client telemetry:** error reporting (unhandled rejections, Pixi context loss, failed asset
   loads) plus Web Vitals and a few product funnels (landing → play → first match → return). Vendor
   is **D7**; whatever it is, `connect-src` must allow it and the privacy page must disclose it.
5. **Moderation basics:** display-name filter (server-side, authoritative), rate limits already
   exist; a lightweight report flow for names.
6. **Scale check:** confirm how quick-play behaves with more than one server replica on Azure
   Container Apps. Colyseus matchmaking across processes needs a shared presence/driver; check
   `docs/hosting.md` and the container app's scaling rules and, if it is single-replica by design,
   record the ceiling and the trigger for changing it.
7. **Housekeeping:** update `CLAUDE.md`, `docs/hosting.md`, and the Terraform README for everything
   above; record a "what we learned" research note per phase, as the repo already does.

### Testing strategy

- axe-core in Playwright on every public route; keyboard-only e2e of lobby → match start.
- Chaos checks: kill the server mid-match (reconnect path), throttle to 3G, background the tab.
- **Gate (launch):** the deploy smoke test, the mobile and desktop e2e suites, and the manual device
  checklist all pass on staging, and telemetry shows real data from a staging session.

---

## Appendix A — Decisions needed (with recommendations)

| ID | Decision | Recommendation | Needed by |
|----|----------|----------------|-----------|
| **D1** | **Art source and budget** — commission a pixel artist; buy/license packs; AI-assisted + human cleanup; or hybrid | **Hybrid:** a coherent licensed pack for environments/UI to unblock (log each license), **commission the knights** — cosmetics need layered tint masks and per-weapon animations that packs almost never provide, and the knight is the game's identity. Start sourcing now (Track A). | Start now; hard block at 15.0 |
| D2 | How Supabase auth config (Google) is applied | Management-API script owned by Terraform, scoped to the keys we own | P12 |
| D3 | Public leaderboard / guests on it (v1 Appendix B #3) | Public read; guests excluded until they link an account | P11 |
| D4 | Bot backfill in public quick play | Offer explicitly ("play a bot while you wait"), never silently; bots never touch persistence | P14 |
| D5 | Arena selection: random / vote / loser-picks (v1 Appendix B #2) | Host-picks for private rooms; **random** for quick play (current behavior) | P14 |
| D6 | Cosmetic tint technique | Multiply-tint greyscale masks; palette-ramp shader only if colors look muddy | P15.2 |
| D7 | Telemetry vendor | Whichever is privacy-friendly with a free tier and EU-safe defaults; decide before P17 | P17 |
| D8 | Keep Discord login | Remove until configured end to end | P12 |
| — | Ranked play (v1 Appendix B #6) | Still out of scope; `matches`/`match_participants` schema supports it later | — |

## Appendix B — Risks

1. **Art is the schedule.** The slice gate (15.0) exists so a wrong direction costs a week, not a
   quarter. Do not skip it.
2. **Render-model churn.** Changing scaling after art exists means redrawing. ADR 0002 lands in P13,
   before any final art, on purpose.
3. **Real-device behavior can't be CI'd.** iOS Safari audio/orientation/PWA quirks and Google OAuth
   are manual checklists; budget time for them and record results.
4. **Schema changes cross the isomorphic boundary** (`PlayerState.name`, `isBot`).
   Each lands in `shared` + server + client in one PR, with the stale-`dist` gotcha in mind
   (rebuild `packages/shared` after merging).
5. **Guest → account merge is data-destructive on the collision path.** Get the confirmation copy
   and the tests right in P12.
6. **Scope creep in "feel".** Time-box P16; the phase is done when combat is legible and satisfying,
   not when it matches a AAA reference.

## Appendix C — Workflow additions

| Workflow | Change | Phase |
|----------|--------|-------|
| `ci.yaml` `verify` | + `assets:check`, + input/scaling pure tests | P13, P15 |
| `ci.yaml` `browser` | + Lighthouse budget on `/` | P11 |
| `e2e.yaml` | + mobile-emulation projects, + visual regression, + axe-core | P13, P15, P17 |
| `nightly.yaml` | + bot-vs-bot balance report, bot load test | P14 |
| `deploy.yaml` smoke | + `/stats`, + landing title check | P11 |
| `docs/hosting.md` | + manual pre-release device/Google checklist | P12, P13 |
