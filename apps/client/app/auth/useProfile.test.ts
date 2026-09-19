import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROFILE_CHANGED_EVENT } from "./profileEvents.js";
import { useProfile } from "./useProfile.js";

const getMyProfileMock = vi.fn();
vi.mock("./supabase.js", () => ({ getMyProfile: () => getMyProfileMock() }));

const KAY = { displayName: "Sir_Kay", isAnonymous: false };
const BORS = { displayName: "Sir_Bors", isAnonymous: false };

describe("useProfile", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("is loading, then the profile", async () => {
    getMyProfileMock.mockResolvedValue(KAY);
    const { result } = renderHook(() => useProfile("u1"));

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual(KAY));
  });

  it("reads nothing for a guest", () => {
    const { result } = renderHook(() => useProfile(null));

    expect(result.current).toBeNull();
    expect(getMyProfileMock).not.toHaveBeenCalled();
  });

  it("never shows one user's profile to the next user who signs in", async () => {
    getMyProfileMock.mockResolvedValue(KAY);
    const { result, rerender } = renderHook(({ id }) => useProfile(id), {
      initialProps: { id: "u1" },
    });
    await waitFor(() => expect(result.current).toEqual(KAY));

    let resolveSecond: (profile: typeof BORS) => void = () => {};
    getMyProfileMock.mockReturnValue(new Promise((resolve) => (resolveSecond = resolve)));
    rerender({ id: "u2" });

    // Loading again, not the previous user's name.
    expect(result.current).toBeUndefined();
    await act(async () => resolveSecond(BORS));
    expect(result.current).toEqual(BORS);
  });

  it("refetches when a name is saved elsewhere", async () => {
    getMyProfileMock.mockResolvedValue(KAY);
    const { result } = renderHook(() => useProfile("u1"));
    await waitFor(() => expect(result.current).toEqual(KAY));

    getMyProfileMock.mockResolvedValue(BORS);
    act(() => {
      window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
    });

    await waitFor(() => expect(result.current).toEqual(BORS));
  });

  it("is null when the profile cannot be read, but keeps a name it already had", async () => {
    getMyProfileMock.mockResolvedValue(KAY);
    const { result } = renderHook(() => useProfile("u1"));
    await waitFor(() => expect(result.current).toEqual(KAY));

    getMyProfileMock.mockRejectedValue(new Error("offline"));
    act(() => {
      window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
    });
    await Promise.resolve();

    expect(result.current).toEqual(KAY);
  });
});
