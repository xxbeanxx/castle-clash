import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Login from "./login.js";

const signInAsGuestMock = vi.fn().mockResolvedValue(undefined);
const signInWithMagicLinkMock = vi.fn().mockResolvedValue(undefined);
const signInWithOAuthMock = vi.fn().mockResolvedValue(undefined);
let authStateCallback: ((session: unknown) => void) | undefined;
const unsubscribeMock = vi.fn();

vi.mock("../auth/supabase.js", () => ({
  signInAsGuest: () => signInAsGuestMock(),
  signInWithMagicLink: (email: string) => signInWithMagicLinkMock(email),
  signInWithOAuth: (provider: string) => signInWithOAuthMock(provider),
  onAuthStateChange: (callback: (session: unknown) => void) => {
    authStateCallback = callback;
    return unsubscribeMock;
  },
}));

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: "/login", Component: Login },
      { path: "/lobby", Component: () => <p>lobby route</p> },
    ],
    { initialEntries: ["/login"] },
  );
  render(<RouterProvider router={router} />);
  return { router };
}

describe("Login route", () => {
  afterEach(() => {
    cleanup();
    signInAsGuestMock.mockClear();
    signInWithMagicLinkMock.mockClear();
    signInWithOAuthMock.mockClear();
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

    await waitFor(() => expect(signInWithMagicLinkMock).toHaveBeenCalledWith("player@example.test"));
    expect(screen.getByText("Check your email for a link")).toBeDefined();
  });

  it("calls OAuth sign-in with the right provider", async () => {
    renderLogin();

    fireEvent.click(screen.getByText("Continue with Discord"));

    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalledWith("discord"));
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
});
