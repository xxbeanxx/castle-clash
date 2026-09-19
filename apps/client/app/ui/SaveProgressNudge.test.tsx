import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveProgressNudge } from "./SaveProgressNudge.js";

const useSessionMock = vi.fn();
const signInWithGoogleMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/useSession.js", () => ({ useSession: () => useSessionMock() }));
vi.mock("../auth/supabase.js", () => ({
  signInWithGoogle: (next?: string) => signInWithGoogleMock(next),
}));

const GUEST = { user: { id: "g1", is_anonymous: true } };
const MEMBER = { user: { id: "m1", is_anonymous: false } };

describe("SaveProgressNudge", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("invites a guest to save their progress", () => {
    useSessionMock.mockReturnValue(GUEST);
    render(<SaveProgressNudge />);

    expect(screen.getByText(/save your progress/i)).toBeDefined();
    expect(screen.getByText(/keep your stats and unlocks/i)).toBeDefined();
  });

  it.each([
    ["a signed-in account", MEMBER],
    ["a visitor who is signed out", null],
    ["a session that has not loaded yet", undefined],
  ])("says nothing to %s", (_label, session) => {
    useSessionMock.mockReturnValue(session);
    render(<SaveProgressNudge />);

    expect(screen.queryByText(/save your progress/i)).toBeNull();
  });

  it("links Google and comes back to the lobby", async () => {
    useSessionMock.mockReturnValue(GUEST);
    render(<SaveProgressNudge />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(signInWithGoogleMock).toHaveBeenCalledWith("/lobby"));
  });

  it("can be dismissed, and stays dismissed", () => {
    useSessionMock.mockReturnValue(GUEST);
    const first = render(<SaveProgressNudge />);

    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(screen.queryByText(/save your progress/i)).toBeNull();

    first.unmount();
    render(<SaveProgressNudge />);
    expect(screen.queryByText(/save your progress/i)).toBeNull();
  });

  it("still shows, and can be dismissed for now, when storage is unavailable", () => {
    useSessionMock.mockReturnValue(GUEST);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<SaveProgressNudge />);

    fireEvent.click(screen.getByRole("button", { name: /not now/i }));

    expect(screen.queryByText(/save your progress/i)).toBeNull();
    vi.restoreAllMocks();
  });

  it("explains a failure to start, and offers the button again", async () => {
    useSessionMock.mockReturnValue(GUEST);
    signInWithGoogleMock.mockRejectedValueOnce(new Error("Manual linking is disabled"));
    render(<SaveProgressNudge />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/manual linking is disabled/i);
    expect(
      (screen.getByRole("button", { name: /continue with google/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
