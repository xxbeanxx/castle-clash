import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotFound from "../routes/not-found.js";
import { ErrorBoundary, HydrateFallback } from "../root.js";
import SiteLayout from "./SiteLayout.js";

vi.mock("../api/serverStats.js", () => ({ useServerStats: () => null }));

const getSessionMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/supabase.js", () => ({
  getSession: () => getSessionMock(),
  onAuthStateChange: () => () => {},
  signOut: () => signOutMock(),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        Component: SiteLayout,
        children: [
          { path: "/", element: <p>home page</p> },
          {
            path: "/boom",
            loader: () => Promise.reject(new Error("kaboom")),
            element: <p>never</p>,
            ErrorBoundary,
          },
          { path: "*", Component: NotFound },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  getSessionMock.mockReset();
  signOutMock.mockClear();
});

describe("SiteLayout", () => {
  it("wraps pages in a header, a main landmark, a skip link and a footer", async () => {
    getSessionMock.mockResolvedValue(null);
    renderAt("/");

    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe(
      "#main",
    );
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("main").textContent).toContain("home page");
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    await waitFor(() => expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy());
  });

  it("offers Sign in when signed out", async () => {
    getSessionMock.mockResolvedValue(null);
    renderAt("/");
    expect((await screen.findByRole("link", { name: "Sign in" })).getAttribute("href")).toBe(
      "/login",
    );
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("labels a guest and offers Sign out, which returns home", async () => {
    getSessionMock.mockResolvedValue({ user: { is_anonymous: true } });
    const router = renderAt("/lobby-ish");
    fireEvent.click(await screen.findByRole("button", { name: /Guest/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    // A guest is asked first: signing out discards their progress.
    fireEvent.click(await screen.findByRole("button", { name: "Sign out anyway" }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("shows neither account state until the session read resolves", () => {
    getSessionMock.mockReturnValue(new Promise(() => {}));
    renderAt("/");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("treats a failed session read as signed out", async () => {
    getSessionMock.mockRejectedValue(new Error("no supabase"));
    renderAt("/");
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("renders the 404 page inside the shell for an unknown path", () => {
    getSessionMock.mockResolvedValue(null);
    renderAt("/nowhere");
    expect(screen.getByRole("main").textContent).toContain("Page not found");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the keep" }).getAttribute("href")).toBe("/");
  });
});

describe("root boundaries", () => {
  it("ErrorBoundary shows the thrown message with a way out", async () => {
    getSessionMock.mockResolvedValue(null);
    renderAt("/boom");
    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("kaboom");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("HydrateFallback is branded, not a bare Loading…", () => {
    render(<HydrateFallback />);
    expect(screen.getByRole("status").textContent).toContain("Castle Clash");
  });
});
