import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveProgressNudge } from "./SaveProgressNudge.js";

const getSessionMock = vi.fn();
const signInWithGoogleMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/supabase.js", () => ({
  getSession: () => getSessionMock(),
  signInWithGoogle: (next?: string) => signInWithGoogleMock(next),
}));

const GUEST = { user: { id: "g1", is_anonymous: true } };
const MEMBER = { user: { id: "m1", is_anonymous: false } };

const nudge = () => screen.findByText(/link a google account/i);

describe("SaveProgressNudge", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("invites a guest to save their progress", async () => {
    getSessionMock.mockResolvedValue(GUEST);
    render(<SaveProgressNudge />);

    expect(await screen.findByText(/save your progress/i)).toBeDefined();
    expect(screen.getByText(/keep your stats and unlocks/i)).toBeDefined();
  });

  it.each([
    ["a signed-in account", MEMBER],
    ["a visitor who is signed out", null],
  ])("says nothing to %s", async (_label, session) => {
    getSessionMock.mockResolvedValue(session);
    render(<SaveProgressNudge />);

    await waitFor(() => expect(getSessionMock).toHaveBeenCalled());
    expect(screen.queryByText(/save your progress/i)).toBeNull();
  });

  it("says nothing while the session is still loading, or if it cannot be read", async () => {
    getSessionMock.mockReturnValue(new Promise(() => {}));
    const pending = render(<SaveProgressNudge />);
    expect(pending.container.textContent).toBe("");
    pending.unmount();

    getSessionMock.mockRejectedValue(new Error("no supabase"));
    render(<SaveProgressNudge />);
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/save your progress/i)).toBeNull();
  });

  it("links Google and comes back to the lobby", async () => {
    getSessionMock.mockResolvedValue(GUEST);
    render(<SaveProgressNudge />);

    fireEvent.click(await screen.findByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(signInWithGoogleMock).toHaveBeenCalledWith("/lobby"));
  });

  it("can be dismissed, and stays dismissed", async () => {
    getSessionMock.mockResolvedValue(GUEST);
    const first = render(<SaveProgressNudge />);

    fireEvent.click(await screen.findByRole("button", { name: /not now/i }));
    expect(screen.queryByText(/save your progress/i)).toBeNull();

    first.unmount();
    render(<SaveProgressNudge />);
    await waitFor(() => expect(getSessionMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/save your progress/i)).toBeNull();
  });

  it("remembers the dismissal for that guest only, not for the next guest on this browser", async () => {
    getSessionMock.mockResolvedValue(GUEST);
    const first = render(<SaveProgressNudge />);
    fireEvent.click(await screen.findByRole("button", { name: /not now/i }));
    first.unmount();

    getSessionMock.mockResolvedValue({ user: { id: "g2", is_anonymous: true } });
    render(<SaveProgressNudge />);

    expect(await nudge()).toBeDefined();
  });

  it("still shows, and can be dismissed for now, when storage is unavailable", async () => {
    getSessionMock.mockResolvedValue(GUEST);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<SaveProgressNudge />);

    fireEvent.click(await screen.findByRole("button", { name: /not now/i }));

    expect(screen.queryByText(/save your progress/i)).toBeNull();
  });

  it("explains a failure to start, and offers the button again", async () => {
    getSessionMock.mockResolvedValue(GUEST);
    signInWithGoogleMock.mockRejectedValueOnce(new Error("Manual linking is disabled"));
    render(<SaveProgressNudge />);

    fireEvent.click(await screen.findByRole("button", { name: /continue with google/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/manual linking is disabled/i);
    expect(
      (screen.getByRole("button", { name: /continue with google/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
