import type { Page } from "@playwright/test";

/** Every route except `/login` is behind `requireSession` (Phase 8), so a spec
 *  has to sign in before it can reach the lobby. Guest sign-in is an anonymous
 *  Supabase session, which the e2e stack's local Supabase allows. */
export async function signInAsGuest(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByText("Play as guest").click();
  await page.waitForURL("/lobby");
}
