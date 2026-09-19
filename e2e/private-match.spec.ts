import { expect, test } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

/**
 * Plan Phase 5's e2e gate: context A creates a private room and reads the
 * code, context B joins by code, both see the countdown/round-active
 * banner, and holding RIGHT in A actually moves A as seen through
 * `window.__CC_DEBUG__` — a real cross-browser round trip through
 * matchmaking, the room, and prediction, not just each layer in isolation.
 */
test("two browsers play a private match end to end", async ({ browser }) => {
  const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);

  await signInAsGuest(pageA);
  await pageA.getByText("Create private room").click();
  await pageA.waitForURL(/\/play\/(?!new\b)/);

  const codeText = await pageA.getByText(/Share this code:/).textContent();
  const code = codeText?.split(":").pop()?.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await signInAsGuest(pageB);
  await pageB.getByLabel("Room code").fill(code!);
  await pageB.getByRole("button", { name: "Join", exact: true }).click();
  await pageB.waitForURL(/\/play\/(?!new\b)/);

  await expect(pageA.getByTestId("match-banner")).toContainText("Fight", { timeout: 15000 });
  await expect(pageB.getByTestId("match-banner")).toContainText("Fight", { timeout: 15000 });

  const before = await pageA.evaluate(() => window.__CC_DEBUG__?.localPosition());
  await pageA.keyboard.down("ArrowRight");
  await pageA.waitForTimeout(300);
  const after = await pageA.evaluate(() => window.__CC_DEBUG__?.localPosition());
  await pageA.keyboard.up("ArrowRight");

  expect(before).not.toBeNull();
  expect(after?.x ?? 0).toBeGreaterThan(before?.x ?? 0);

  await contextA.close();
  await contextB.close();
});
