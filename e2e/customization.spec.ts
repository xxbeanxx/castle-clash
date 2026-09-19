import { expect, test } from "@playwright/test";
import { signInAsGuest } from "./helpers.js";

const CUSTOM_TINT_LABEL = "#ff4444";
const CUSTOM_TINT_VALUE = 0xff4444;

/**
 * Plan Phase 9's e2e gate: a guest changes their tint, saves it, and joins
 * a private room — the opponent context reads it back via the debug hook,
 * proving the cosmetic actually reached the server and back out to another
 * client (not just this browser's own local state), and a reload of
 * `/loadout` proves it survived a fresh page load (not just in-memory React
 * state).
 *
 * Deliberately does NOT drive the match all the way to `MatchOver` to check
 * `/stats`'s `matches_played` increment the way the plan's prose names —
 * doing that with two real Playwright browser contexts needs several
 * connection-drop/reconnect cycles (see `MatchRoom.cosmetics.test.ts` for
 * the equivalent scripted against a real Colyseus room, and
 * `feedback_verify_client_live.md`'s "close a tab to end a round" note for
 * why a real fight isn't needed) — a second, heavier spec, not an addition
 * to this one. `MatchRoom.cosmetics.test.ts` already covers "a completed
 * match increments stats and can grant an unlock" server-side.
 */
test("a guest customizes, saves, and sees their cosmetic in another browser", async ({
  browser,
}) => {
  const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);

  await signInAsGuest(pageA);
  await pageA.goto("/loadout");
  // Both palettes (primary and secondary tint) offer the same swatch labels.
  const primaryTint = pageA.getByRole("group", { name: "Primary tint" });
  await primaryTint.getByLabel(CUSTOM_TINT_LABEL).click();
  await pageA.getByText("Save loadout").click();
  await expect(pageA.getByText("Saved.")).toBeVisible();

  // Persistence across a fresh page load, not just in-memory React state.
  await pageA.reload();
  await expect(
    pageA.getByRole("group", { name: "Primary tint" }).getByLabel(CUSTOM_TINT_LABEL),
  ).toHaveAttribute("aria-pressed", "true");

  await pageA.goto("/lobby");
  await pageA.getByText("Create private room").click();
  await pageA.waitForURL(/\/play\/(?!new\b)/);
  const codeText = await pageA.getByText(/Share this code:/).textContent();
  const code = codeText?.split(":").pop()?.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await signInAsGuest(pageB);
  await pageB.goto("/lobby");
  await pageB.getByLabel("Room code").fill(code!);
  await pageB.getByRole("button", { name: "Join", exact: true }).click();
  await pageB.waitForURL(/\/play\/(?!new\b)/);

  await expect(pageA.getByTestId("match-banner")).toContainText("Fight", { timeout: 15000 });
  await expect(pageB.getByTestId("match-banner")).toContainText("Fight", { timeout: 15000 });

  // The opponent context reads A's tint back via the debug hook — this is
  // the actual "server-validated cosmetics visible to all players, can't be
  // spoofed" gate, not just "A can see A's own saved setting."
  await expect
    .poll(async () => {
      const cosmetics = await pageB.evaluate(() => window.__CC_DEBUG__?.allCosmetics() ?? []);
      return cosmetics.some((c) => c.tintPrimary === CUSTOM_TINT_VALUE);
    })
    .toBe(true);

  await contextA.close();
  await contextB.close();
});
