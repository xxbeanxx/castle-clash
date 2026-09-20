import { expect, test } from "@playwright/test";

/**
 * Phase 14's gate: a brand-new visitor, alone, is in a fight within seconds and can finish a match,
 * then play again, with no second human anywhere. Practice rooms are private (never shared with
 * another spec), so unlike quick play this is safe to run in parallel with the rest.
 *
 * The visitor never presses a key: the bot wins every round, which is the cheapest way to reach a
 * results screen. A real player fights back; that is what the balance tests and the manual
 * checklist are for.
 */
test("a lone visitor starts practice from the landing page, finishes the match, and plays again", async ({
  page,
}) => {
  test.setTimeout(240_000);

  const arrived = Date.now();
  await page.goto("/");
  await page.getByRole("button", { name: "Practice vs a bot" }).click();
  await page.waitForURL(/\/play\/(?!new\b)/);

  // In a fight quickly, with the bot named as one.
  await expect(page.getByTestId("match-banner")).toContainText("Fight!", { timeout: 15_000 });
  expect(Date.now() - arrived).toBeLessThan(15_000);
  await expect(page.getByTestId("combat-hud")).toContainText("(bot)");
  // Nothing tells a lone visitor to wait for a stranger.
  await expect(page.getByTestId("backfill-prompt")).toHaveCount(0);

  // Play through: pick the first power-up whenever the draft opens, until the results appear.
  const results = page.getByTestId("results-overlay");
  await expect(async () => {
    const card = page.getByTestId("draft-card").first();
    if (await card.isVisible()) {
      await card.click();
    }
    await expect(results).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 200_000, intervals: [500] });

  await expect(results.getByRole("heading")).toContainText("wins!");
  await expect(results.getByRole("cell", { name: /\(bot\)/ })).toBeVisible();
  await expect(results.getByRole("link", { name: "Back to lobby" })).toBeVisible();

  // Play again: the same room starts a fresh match, and the results go away.
  await results.getByTestId("play-again").click();
  await expect(results).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId("match-banner")).toContainText(/Get ready|Fight!/, {
    timeout: 15_000,
  });
});

test("the lobby's practice panel carries its choices into the room", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Play as guest").click();
  await page.waitForURL("/lobby");

  await page.getByLabel("Bots").selectOption("2");
  await page.getByLabel("Difficulty").selectOption("hard");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.waitForURL(/\/play\/(?!new\b)/);

  await expect(page.getByTestId("match-banner")).toContainText("Fight!", { timeout: 15_000 });
  // The local player plus two bots, each shown by name in the HUD.
  await expect(page.getByTestId("combat-hud").locator(".cc-hud__player")).toHaveCount(3);
  await expect(page.getByTestId("combat-hud")).toContainText("(bot)");
});
