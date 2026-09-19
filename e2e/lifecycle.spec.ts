import { expect, test } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

/** Phase 13 step 10 and 12: a dropped socket shows "Reconnecting…" and recovers (the SDK's own
 *  reconnection, driven here by closing the socket with its "may try reconnect" code), and the
 *  debug hook reports frame times. Real backgrounded-tab behavior on a phone is the manual
 *  checklist. */
test("a dropped connection shows Reconnecting, recovers, and play resumes", async ({ page }) => {
  await signInAsGuest(page);
  await page.getByText("Create private room").click();
  await page.waitForURL(/\/play\/(?!new\b)/);
  await page.waitForFunction(() => window.__CC_DEBUG__?.localPosition() != null);
  // The SDK does not retry a socket that lived under its 5 s `minUptime`.
  await page.waitForTimeout(5500);

  // The overlay can be up for only a few hundred ms, so record what it showed instead of polling.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="connection-overlay"]')?.textContent;
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    window.__CC_DEBUG__?.dropConnection();
  });

  await expect(page.getByTestId("connection-overlay")).toBeHidden({ timeout: 20000 });
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen[0]).toContain("Reconnecting");
  expect(seen.join(" ")).not.toContain("Connection lost");

  // Back in the game: input works again.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowRight");
  const after = await page.evaluate(() => window.__CC_DEBUG__?.localPosition());
  expect(after).not.toBeNull();
});

test("the debug hook reports frame times", async ({ page }) => {
  await signInAsGuest(page);
  await page.getByText("Create private room").click();
  await page.waitForURL(/\/play\/(?!new\b)/);
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => window.__CC_DEBUG__?.frameStats());
  expect(stats).not.toBeNull();
  // Only that frames are being recorded: how many fit in 1.5 s depends on how loaded the runner is
  // (a headless software-rendered browser among a dozen others managed 21).
  expect(stats!.frames).toBeGreaterThan(5);
  expect(stats!.meanMs).toBeGreaterThan(0);
});
