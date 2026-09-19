import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

/**
 * Phase 13 step 7's gate, in a real browser: a phone-shaped context drives `TouchControls` with
 * real multi-touch (CDP `Input.dispatchTouchEvent`, so pointer events arrive with pointerType
 * "touch") against a desktop keyboard player, and the movement shows up in the sim through
 * `window.__CC_DEBUG__`. Real-device feel (thumb reach, iOS Safari gesture leaks) is the manual
 * checklist; this proves the wiring and that nothing sticks.
 */
interface Touch {
  id: number;
  x: number;
  y: number;
}

async function dispatch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  touches: Touch[],
): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: touches.map(({ id, x, y }) => ({ id, x, y })),
  });
}

async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  expect(box, selector).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

const position = (page: Page) => page.evaluate(() => window.__CC_DEBUG__?.localPosition());

test("a phone player drives the stick and buttons against a keyboard player", async ({
  browser,
}) => {
  const phone = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const desktop = await browser.newContext();
  const [phonePage, desktopPage] = await Promise.all([phone.newPage(), desktop.newPage()]);
  const cdp = await phone.newCDPSession(phonePage);

  await signInAsGuest(phonePage);
  await phonePage.getByText("Create private room").click();
  await phonePage.waitForURL(/\/play\/(?!new\b)/);
  const code = (await phonePage.getByText(/Share this code:/).textContent())
    ?.split(":")
    .pop()
    ?.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await signInAsGuest(desktopPage);
  await desktopPage.getByLabel("Room code").fill(code!);
  await desktopPage.getByRole("button", { name: "Join", exact: true }).click();
  await desktopPage.waitForURL(/\/play\/(?!new\b)/);

  await expect(phonePage.getByTestId("match-banner")).toContainText("Fight", { timeout: 15000 });
  await expect(phonePage.getByTestId("touch-controls")).toBeVisible();

  // Stick: drag right from inside the zone, the knight moves right; lifting stops it.
  const before = (await position(phonePage))!;
  const start = { id: 1, x: 150, y: 260 };
  await dispatch(cdp, "touchStart", [start]);
  await dispatch(cdp, "touchMove", [{ ...start, x: 220 }]);
  await phonePage.waitForTimeout(400);
  const moved = (await position(phonePage))!;
  expect(moved.x).toBeGreaterThan(before.x + 10);

  // Two thumbs at once: stick still held, a Jump tap on the other pointer lifts the knight.
  const jump = await centerOf(phonePage, '[data-touch-button="JUMP"]');
  const groundY = moved.y;
  await dispatch(cdp, "touchStart", [
    { ...start, x: 220 },
    { id: 2, ...jump },
  ]);
  // Poll rather than sleep: under load the jump can take a few frames to show up.
  await expect
    .poll(async () => (await position(phonePage))!.y, { timeout: 3000 })
    .toBeLessThan(groundY - 5);
  await expect(phonePage.locator('[data-touch-button="JUMP"]')).toHaveAttribute(
    "data-pressed",
    "true",
  );
  await dispatch(cdp, "touchEnd", [{ ...start, x: 220 }]); // pointer 2 lifted, stick remains

  // Lift everything: no input may stay held.
  await dispatch(cdp, "touchEnd", []);
  await expect(phonePage.locator('[data-touch-button="JUMP"]')).toHaveAttribute(
    "data-pressed",
    "false",
  );
  await phonePage.waitForTimeout(1200); // land and settle
  const settled = (await position(phonePage))!;
  await phonePage.waitForTimeout(400);
  const later = (await position(phonePage))!;
  expect(Math.abs(later.x - settled.x)).toBeLessThan(1);

  // A cancelled touch (the OS taking the gesture) also frees the stick.
  await dispatch(cdp, "touchStart", [start]);
  await dispatch(cdp, "touchMove", [{ ...start, x: 220 }]);
  await phonePage.waitForTimeout(150);
  await dispatch(cdp, "touchCancel", []);
  await phonePage.waitForTimeout(200);
  const afterCancel = (await position(phonePage))!;
  await phonePage.waitForTimeout(400);
  const afterCancelLater = (await position(phonePage))!;
  expect(Math.abs(afterCancelLater.x - afterCancel.x)).toBeLessThan(1);

  await phone.close();
  await desktop.close();
});
