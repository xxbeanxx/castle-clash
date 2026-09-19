import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Login from "./login.js";

const signInAsGuestMock = vi.fn().mockResolvedValue(undefined);
const signInWithMagicLinkMock = vi.fn().mockResolvedValue(undefined);
const signInWithGoogleMock = vi.fn().mockResolvedValue(undefined);
let authStateCallback: ((session: unknown) => void) | undefined;
const unsubscribeMock = vi.fn();

vi.mock("../auth/supabase.js", () => ({
  signInAsGuest: () => signInAsGuestMock(),
  signInWithMagicLink: (email: string) => signInWithMagicLinkMock(email),
  signInWithGoogle: (next?: string) => signInWithGoogleMock(next),
  onAuthStateChange: (callback: (session: unknown) => void) => {
    authStateCallback = callback;
    return unsubscribeMock;
  },
}));

function renderLogin(entry = "/login") {
  const router = createMemoryRouter(
    [
      { path: "/login", Component: Login },
      { path: "/lobby", Component: () => <p>lobby route</p> },
      { path: "/play/:roomId", Component: () => <p>play route</p> },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return { router };
}

describe("Login route", () => {
  afterEach(() => {
    cleanup();
    signInAsGuestMock.mockClear();
    signInWithMagicLinkMock.mockClear();
    signInWithGoogleMock.mockClear();
    authStateCallback = undefined;
  });

  it("calls anonymous sign-in when the guest button is clicked", async () => {
    renderLogin();

    fireEvent.click(screen.getByText("Play as guest"));

    await waitFor(() => expect(signInAsGuestMock).toHaveBeenCalledTimes(1));
  });

  it("calls magic-link sign-in with the entered email on submit", async () => {
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.test" } });
    fireEvent.click(screen.getByText("Send magic link"));

    await waitFor(() =>
      expect(signInWithMagicLinkMock).toHaveBeenCalledWith("player@example.test"),
    );
    expect(screen.getByText("Check your email for a link")).toBeDefined();
  });

  it("starts Google sign-in, defaulting the return trip to the lobby", async () => {
    renderLogin();

    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(signInWithGoogleMock).toHaveBeenCalledWith("/lobby"));
  });

  it("carries a private-room link through Google, so the friend lands in the room (F5)", async () => {
    renderLogin(`/login?next=${encodeURIComponent("/play/new?mode=private&code=ABC123")}`);

    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() =>
      expect(signInWithGoogleMock).toHaveBeenCalledWith("/play/new?mode=private&code=ABC123"),
    );
  });

  it("does not hand Google a destination that leaves the site", async () => {
    renderLogin(`/login?next=${encodeURIComponent("https://evil.example/x")}`);

    fireEvent.click(screen.getByText("Continue with Google"));

    await waitFor(() => expect(signInWithGoogleMock).toHaveBeenCalledWith("/lobby"));
  });

  it("offers no Discord button until Discord is configured end to end", () => {
    renderLogin();

    expect(screen.queryByText(/discord/i)).toBeNull();
  });

  it("navigates to /lobby once onAuthStateChange reports a session", async () => {
    const { router } = renderLogin();

    expect(authStateCallback).toBeDefined();
    authStateCallback?.({ access_token: "token" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
  });

  it("shows an error message when sign-in fails", async () => {
    signInAsGuestMock.mockRejectedValueOnce(new Error("network down"));
    renderLogin();

    fireEvent.click(screen.getByText("Play as guest"));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("network down"));
  });
  it("returns to the page it was sent from once signed in (?next=)", async () => {
    const { router } = renderLogin(
      `/login?next=${encodeURIComponent("/play/new?mode=private&code=ABC123")}`,
    );

    authStateCallback?.({ access_token: "t" });

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        "/play/new?mode=private&code=ABC123",
      ),
    );
  });

  it("ignores a ?next= that leaves the site, and goes to the lobby", async () => {
    const { router } = renderLogin(`/login?next=${encodeURIComponent("https://evil.example/x")}`);

    authStateCallback?.({ access_token: "t" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
  });
});
