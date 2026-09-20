import { expect, test } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

/**
 * Phase 14 step 4: the first-run tutorial. A room of your own with a training dummy, no countdown,
 * a coach that names each step and ticks it off from what your knight really does, skippable, and
 * shown once. Tutorial rooms are private, so this is safe alongside every other spec.
 */
test("a first visit meets the tutorial, and the lobby tutorial teaches every move and lets you leave", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await signInAsGuest(page);
  await page.getByRole("link", { name: /Tutorial/ }).click();
  await page.waitForURL(/\/play\/(?!new\b)/);

  const guide = page.getByTestId("tutorial-guide");
  await expect(guide).toContainText("Step 1 of 7: Move", { timeout: 15_000 });
  // No countdown, no round: a fight from the first second, with the dummy named as a bot.
  await expect(page.getByTestId("combat-hud")).toContainText("Training dummy (bot)");

  // 1. Move. Ends up under the platform.
  await page.keyboard.down("KeyD");
  await expect(guide).toContainText("Step 2 of 7: Jump");
  // Keep running until under the platform (it spans x 480-800; the spawn is at 200).
  await page.waitForTimeout(1100);
  await page.keyboard.up("KeyD");

  // 2. Jump. A tap is only a short hop: hold Space for a full jump, which lands on the platform.
  await page.keyboard.down("Space");
  await expect(guide).toContainText("Step 3 of 7: Drop through");
  await page.waitForTimeout(500);
  await page.keyboard.up("Space");

  // 3. Drop through: from the platform, S and Space together. Jump back up until it takes.
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await guide.textContent())?.includes("Step 4 of 7")) break;
    await page.waitForTimeout(400);
    await page.keyboard.down("KeyS");
    await page.keyboard.down("Space");
    await page.waitForTimeout(150);
    await page.keyboard.up("Space");
    await page.keyboard.up("KeyS");
    await page.waitForTimeout(600);
    if (!(await guide.textContent())?.includes("Step 4 of 7")) {
      // Still on the floor: hold a jump to get back on the platform and try again.
      await page.keyboard.down("Space");
      await page.waitForTimeout(500);
      await page.keyboard.up("Space");
    }
  }
  await expect(guide).toContainText("Step 4 of 7: Light attack");

  // 4-7. Fight moves. A press during the previous swing's recovery is ignored, as it is for a
  // player, so each is repeated until the coach moves on.
  const doUntil = async (nextStep: string, act: () => Promise<void>): Promise<void> => {
    for (let attempt = 0; attempt < 10; attempt++) {
      if ((await guide.textContent())?.includes(nextStep)) return;
      await act();
      await page.waitForTimeout(600);
    }
  };
  await doUntil("Step 5 of 7", () => page.keyboard.press("KeyJ"));
  await doUntil("Step 6 of 7", () => page.keyboard.press("KeyK"));
  await doUntil("Step 7 of 7", async () => {
    await page.keyboard.down("KeyL");
    await page.waitForTimeout(250);
    await page.keyboard.up("KeyL");
  });
  await doUntil("You are ready", () => page.keyboard.press("ShiftLeft"));

  await expect(page.getByTestId("tutorial-complete")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/lobby");
});

test("a cold visitor's first click goes through the tutorial, and it never comes back uninvited", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice vs a bot" }).click();
  await page.waitForURL(/\/play\/(?!new\b)/, { timeout: 20_000 });
  expect(page.url()).toContain("mode=tutorial");
  await expect(page.getByTestId("tutorial-guide")).toContainText("Step 1 of 7", {
    timeout: 15_000,
  });

  // Skipping goes where the visitor was headed: practice, with a real bot (not the dummy).
  await page.getByRole("button", { name: "Skip tutorial" }).click();
  await page.waitForURL(
    (url) => url.search.includes("mode=practice") && !url.pathname.endsWith("/new"),
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("combat-hud")).toContainText("(bot)", { timeout: 15_000 });
  await expect(page.getByTestId("combat-hud")).not.toContainText("Training dummy");
  await expect(page.getByTestId("tutorial-guide")).toHaveCount(0);

  // Seen once: the next visit's first click goes straight to the fight.
  await page.goto("/");
  await page.getByRole("button", { name: "Practice vs a bot" }).click();
  await page.waitForURL(/\/play\/(?!new\b)/, { timeout: 20_000 });
  expect(page.url()).not.toContain("tutorial");
  await expect(page.getByTestId("tutorial-guide")).toHaveCount(0);
});

test("the tutorial is reachable from How to play", async ({ page }) => {
  await signInAsGuest(page);
  await page.goto("/how-to-play");
  await page.getByRole("link", { name: "tutorial" }).click();
  await page.waitForURL(/\/play\/(?!new\b)/);
  await expect(page.getByTestId("tutorial-guide")).toContainText("Step 1 of 7", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Skip tutorial" }).click();
  await page.waitForURL("/how-to-play");
});
