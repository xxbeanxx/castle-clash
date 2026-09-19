# Phase 11: React Router v8 SPA-mode `prerender`, metadata, and the nginx fallout

Written 2026-09-19. `docs/IMPLEMENTATION_PLAN_V2.md` step 6 said to "evaluate React Router
`prerender` for the static routes" before deciding. This records what was checked against the
installed `react-router@8.4.0` / `@react-router/dev@8.4.0` (not against remembered docs) and the
decision it led to.

## Verified

- **`prerender` works with `ssr: false`.** `react-router.config.ts` takes
  `prerender: string[]` (typed in `@react-router/dev`'s `config.d.ts`). With
  `ssr: false, prerender: ["/", "/how-to-play", "/privacy", "/terms", "/about"]`, `pnpm build`
  prints one `Prerender (html): <path> -> build/client/<path>/index.html` line per path and one for
  the SPA fallback, and emits:
  - `build/client/index.html` (the prerendered `/`, 17.8 KB, real `<h1>` and content),
  - `build/client/{how-to-play,privacy,terms,about}/index.html`,
  - `build/client/__spa-fallback.html`, the bare root-only shell (4 KB) for every _other_ route.
- **Per-route `meta` is rendered into the HTML `<head>`** at build time: each prerendered file has
  its own `<title>`, canonical link and Open Graph tags (checked with `grep` on the output). A
  route's `meta` export **replaces** its parent's wholesale, so every page passes a full set through
  `app/meta.ts`'s `pageMeta()`; the root `meta` is only the default and what `__spa-fallback.html`
  carries.
- **Pixi stays out of `/`.** The prerendered `index.html`'s `modulepreload` list contains the root,
  layout, `home`, supabase and shared chunks and nothing from Pixi (`grep -ci pixi index.html` is 0).
  Route modules are already code-split; `game/**` is only reachable from `play` and `loadout`.
- **Prerendering runs the routes' render path once in Node.** Anything touching `window` during
  render would break the build. Nothing does: `getRuntimeConfig()`, `useSession`, `useServerStats`
  and the leaderboard read all run in effects.

## The consequence that would have shipped broken: nginx

Both of these were found by running the built `build/client` under the real
`nginxinc/nginx-unprivileged:1.31-alpine` image with `docker/nginx.conf` mounted (podman), not by
reading config.

1. **`try_files $uri $uri/ /index.html` is now wrong.** `/index.html` is the prerendered landing
   page, so an unknown or client-only route (`/lobby`) would be served the landing HTML and
   hydrate a tree that doesn't match it. The fallback must be `/__spa-fallback.html`.
2. **`$uri/` leaks the container's port.** For a directory (`/privacy`), nginx answers
   `301 → http://127.0.0.1:8080/privacy/` using its own `listen` port, which Azure Container Apps'
   ingress does not expose. Prerendered pages are therefore looked up as `$uri/index.html`
   directly, which serves `/privacy` and `/privacy/` with a plain 200. The final rule is
   `try_files $uri $uri/index.html /__spa-fallback.html;`.

Probed after the fix: `/`, `/privacy`, `/privacy/`, `/how-to-play` → their own titles; `/lobby`,
`/nope/deep` → the shell; `/index.html` → `no-cache` and the CSP include still applied.

## Decisions

- **Adopted `prerender`** for `/` and the four static pages. It gives crawlers and link unfurlers
  real HTML, the landing's LCP no longer waits for JS, and Google's OAuth consent screen review
  (Phase 12) can read the privacy and terms pages without executing script.
- **The deploy smoke's "client loads" check** looked for exactly `<title>Castle Clash</title>`.
  The landing title is now "Castle Clash: knight arena brawler", so the check is the prefix
  `<title>Castle Clash` (still rejects Azure's placeholder, the nginx default page, and error
  pages).
- **Canonical and Open Graph URLs always name production** (`SITE_URL` in `app/meta.ts`), including
  on staging, so a shared staging link can't become the indexed page.
- **Guarded and content-free routes** (`login`, `lobby`, `loadout`, `stats`, `play`, 404) get a plain
  title and `robots: noindex` via `privatePageMeta()`; `robots.txt` also disallows them.

## Not solved (worth knowing)

- **Unknown URLs return 200**, not 404, in SPA mode: nginx serves the shell and the client renders
  the 404 page. Crawlers may treat those as soft 404s. Fixing it needs a server-side route list.
- **Staging is indexable.** `robots.txt` is one static file shared by both environments and points
  at the production sitemap. Staging pages canonicalise to production, which limits the harm, but a
  `noindex` header on the staging host would be the proper fix.
- **`sitemap.xml` and `robots.txt` are hand-maintained** in `apps/client/public/`. Six URLs; add a
  page, add a line.
- **OG image** (`public/og.png`, 1200x630) was rendered once with Playwright from an HTML file using
  the vendored fonts and is committed as a binary; regenerate it by hand if the hero copy changes.
- **`supabase-js` (341 KB raw) is in the `/` chunk graph** because the header's `useSession` and the
  Play-now button import `auth/supabase.ts`. Lighthouse decides whether that needs lazy-loading.
