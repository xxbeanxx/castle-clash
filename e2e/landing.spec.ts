import { expect, test } from "@playwright/test";

/**
 * v2 plan Phase 11's gate: from a cold browser (no session, no storage), the
 * landing page gets a stranger into a room in two clicks and no typing. The
 * first click is the visit itself, the second is Play now: guest sign-in and
 * quick play happen behind that one button. (Phase 14: a first visit lands in the
 * tutorial room on the way; either way it is a room with the local player's HUD.)
 */
test("a cold visitor reaches a room with one click and no typing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Last knight standing");

  await page.getByRole("button", { name: "Play now" }).first().click();

  await page.waitForURL(/\/play\/(?!new\b)/, { timeout: 20000 });
  // The HUD renders once the server's state carries the local player: that is "in a room".
  // (Not the match banner: quick play joins the shared public room, which may be mid-match.)
  await expect(page.getByTestId("combat-hud")).toBeVisible({ timeout: 15000 });
});

test("public pages load without signing in", async ({ page }) => {
  for (const [path, heading] of [
    ["/how-to-play", "How to play"],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of service"],
    ["/about", "About Castle Clash"],
    ["/leaderboard", "Leaderboard"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  }
});

test("a guarded page sends a visitor to login and returns them after sign-in", async ({ page }) => {
  await page.goto("/stats");
  await page.waitForURL(/\/login\?next=%2Fstats/);

  await page.getByText("Play as guest").click();
  await page.waitForURL("/stats");
});

test("an unknown path shows the 404 page inside the site chrome", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
});
