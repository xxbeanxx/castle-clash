import { expect, test } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

/** Phase 13 step 8: portrait on a phone asks for landscape, landscape does not, and the PWA
 *  manifest is served so "Add to Home Screen" removes the browser chrome. */
test("a phone in portrait sees the rotate prompt; turning it away clears it", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await signInAsGuest(page);
  await page.getByText("Create private room").click();
  await page.waitForURL(/\/play\/(?!new\b)/);

  await expect(page.getByTestId("rotate-prompt")).toBeVisible();
  await expect(page.getByTestId("rotate-prompt")).toContainText("Rotate your device");

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId("rotate-prompt")).toBeHidden();
  await expect(page.getByTestId("touch-controls")).toBeVisible();

  await context.close();
});

test("a desktop window never sees the rotate prompt", async ({ page }) => {
  await signInAsGuest(page);
  await page.getByText("Create private room").click();
  await page.waitForURL(/\/play\/(?!new\b)/);
  await expect(page.getByTestId("rotate-prompt")).toBeHidden();
});

test("the web app manifest is served and linked", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.orientation).toBe("landscape");
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});
