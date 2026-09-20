import { expect, test } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

/**
 * ADR 0002's render surface in a real browser: for each device viewport, the canvas's backing
 * store is the physical size, the scale is a whole number, and the arena sits centered on the
 * art-pixel grid. The (CSS size, DPR) -> scale table itself is pure and covered by
 * `surface.test.ts`; this catches what a unit test cannot (Pixi resize, DPR plumbing, the
 * ResizeObserver, rotation).
 */
const DEVICES = [
  { name: "iPhone SE landscape", w: 667, h: 375, dpr: 2, scale: 2 },
  { name: "iPhone 14 landscape", w: 844, h: 390, dpr: 3, scale: 3 },
  { name: "Pixel 7 landscape", w: 915, h: 412, dpr: 2.625, scale: 3 },
  { name: "desktop 1080p", w: 1920, h: 1080, dpr: 1, scale: 3 },
] as const;

for (const device of DEVICES) {
  test(`${device.name}: integer scale on the physical canvas`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: device.w, height: device.h },
      deviceScaleFactor: device.dpr,
    });
    const page = await context.newPage();
    await signInAsGuest(page);
    await page.getByText("Create private room").click();
    await page.waitForURL(/\/play\/(?!new\b)/);
    await page.waitForFunction(() => window.__CC_DEBUG__?.surface() != null);

    const surface = await page.evaluate(() => window.__CC_DEBUG__?.surface());
    expect(surface).not.toBeNull();
    const { layout, canvas, stage } = surface!;

    expect(layout.scale).toBe(device.scale);
    expect(layout.fractional).toBe(false);
    expect(canvas).toEqual({ width: layout.physW, height: layout.physH });
    expect(layout.physW).toBe(Math.floor(device.w * device.dpr));
    // The arena is centered and on the art grid: stage offset is a whole multiple of the scale.
    expect(stage.scale).toBe(device.scale / 2);
    expect(stage.x % device.scale).toBeCloseTo(0, 6);
    expect(stage.y % device.scale).toBeCloseTo(0, 6);
    // 1280x720 arena at `scale/2` physical px per unit is 640x360 art px: it fits.
    expect(640 * device.scale).toBeLessThanOrEqual(layout.physW);
    expect(360 * device.scale).toBeLessThanOrEqual(layout.physH);

    await context.close();
  });
}

test("rotating the viewport re-lays out the surface", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  await signInAsGuest(page);
  await page.getByText("Create private room").click();
  await page.waitForURL(/\/play\/(?!new\b)/);
  await page.waitForFunction(() => window.__CC_DEBUG__?.surface()?.layout.scale === 3);

  await page.setViewportSize({ width: 667, height: 375 });
  await page.waitForFunction(() => window.__CC_DEBUG__?.surface()?.layout.physW === 667 * 3);
  const after = await page.evaluate(() => window.__CC_DEBUG__?.surface());
  expect(after?.layout.scale).toBe(3);
  expect(after?.canvas.width).toBe(667 * 3);

  await context.close();
});
