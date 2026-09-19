import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against a real client + server, not `pnpm dev` in-process — CI's
 * `e2e.yaml` points `CLIENT_URL` at the compose stack's client container
 * (see `compose.yaml`/`containers.yaml`'s `smoke` job for the equivalent
 * server-side stack). Locally: `pnpm dev`, then `CLIENT_URL=http://localhost:5173
 * pnpm --filter @castle-clash/e2e run test:e2e` (an e2e build needs
 * `VITE_E2E=1` for `window.__CC_DEBUG__` — `pnpm dev` doesn't set it, so a
 * spec relying on that hook needs `VITE_E2E=1 pnpm dev` instead).
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // The default ("list") reporter doesn't persist anything — the html
  // reporter both writes a self-contained report AND embeds each failed
  // test's trace.zip/video.webm into it, so uploading just this one
  // directory (as e2e.yaml does) is enough to get both on a CI failure.
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.CLIENT_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // Everything except the device-profile smoke, at Playwright's default desktop viewport. Specs
    // that need a phone (render-surface, touch-controls, landscape) build their own contexts.
    { name: "desktop", testIgnore: /mobile-smoke\.spec\.ts/ },
    // Phase 13: device emulation. CI installs Chromium only, so these are Chromium with the
    // devices' viewport, DPR, touch and user agent, NOT WebKit: iOS Safari's own behavior (safe
    // areas, gesture leaks, Fullscreen) stays on the manual real-device checklist.
    {
      name: "pixel-7-landscape",
      testMatch: /mobile-smoke\.spec\.ts/,
      use: { ...devices["Pixel 7 landscape"], defaultBrowserType: "chromium" },
    },
    {
      name: "iphone-14-landscape",
      testMatch: /mobile-smoke\.spec\.ts/,
      use: { ...devices["iPhone 14 landscape"], defaultBrowserType: "chromium" },
    },
  ],
});
