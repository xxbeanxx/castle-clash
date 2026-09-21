import { expect, test } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

/**
 * Phase 15's effects, end to end: a running knight kicks up dust, so the live particle count rises.
 * A private practice room, so it is safe to run in
 * parallel with the rest. It reads `fxActive()` from the `VITE_E2E` debug hook rather than pixels.
 */
test("running kicks up dust", async ({ page }) => {
  await signInAsGuest(page);
  await page.goto("/play/new?mode=practice&bots=1&tier=easy");
  await expect(page.getByTestId("match-banner")).toContainText("Fight", { timeout: 15_000 });

  expect(await page.evaluate(() => window.__CC_DEBUG__?.fxActive())).toBeGreaterThanOrEqual(0);

  await page.keyboard.down("ArrowRight");
  await expect
    .poll(() => page.evaluate(() => window.__CC_DEBUG__?.fxActive() ?? 0), { timeout: 5_000 })
    .toBeGreaterThan(0);
  await page.keyboard.up("ArrowRight");
  // Dust fading and the pool's cap are unit-tested (`Fx.browser.test.ts`); a bot in the room may keep
  // landing hits, so "back to zero" is not something this spec can wait for reliably.
});
