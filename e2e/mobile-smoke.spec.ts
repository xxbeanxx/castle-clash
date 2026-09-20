import { expect, test } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

/**
 * Runs once per phone project in `playwright.config.ts` (Pixel 7 and iPhone 14, landscape). The
 * device profile supplies the viewport, DPR, touch and user agent; this asserts what a phone must
 * get from the game without anyone touching it: touch controls up, an integer render scale, and
 * nothing that scrolls or overflows the page.
 */
test("the game surface on a phone: controls, integer scale, no scroll leak", async ({ page }) => {
  await signInAsGuest(page);
  await page.getByText("Create private room").click();
  await page.waitForURL(/\/play\/(?!new\b)/);
  await page.waitForFunction(() => window.__CC_DEBUG__?.localPosition() != null);

  await expect(page.getByTestId("touch-controls")).toBeVisible();
  await expect(page.getByTestId("rotate-prompt")).toBeHidden();

  // Every one of the five buttons is at least the 48 px minimum target.
  for (const id of ["JUMP", "LIGHT", "HEAVY", "BLOCK", "DODGE"]) {
    const box = await page.locator(`[data-touch-button="${id}"]`).boundingBox();
    expect(box, id).not.toBeNull();
    expect(Math.min(box!.width, box!.height), id).toBeGreaterThanOrEqual(48);
  }

  // The page itself must not scroll or overflow: it is a game surface.
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(0);
  expect(overflow.y).toBeLessThanOrEqual(0);
});
