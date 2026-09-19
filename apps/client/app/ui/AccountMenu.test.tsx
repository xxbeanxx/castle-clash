import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE_CHANGED_EVENT } from "../auth/profileEvents.js";
import { AccountMenu } from "./AccountMenu.js";

const getMyProfileMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/supabase.js", () => ({
  getMyProfile: () => getMyProfileMock(),
  signOut: () => signOutMock(),
}));

const GUEST = { user: { id: "g1", is_anonymous: true } } as never;
const MEMBER = { user: { id: "m1", is_anonymous: false } } as never;

function renderMenu(session: never) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <>
            <AccountMenu session={session} />
            <button>outside</button>
          </>
        ),
      },
      { path: "/account", element: <p>account page</p> },
      { path: "/loadout", element: <p>loadout page</p> },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return { router };
}

const trigger = () => screen.getByRole("button", { expanded: false });

describe("AccountMenu", () => {
  beforeEach(() => {
    getMyProfileMock.mockResolvedValue({ displayName: "Sir_Kay", isAnonymous: false });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("labels the button with the player's name", async () => {
    renderMenu(MEMBER);

    expect(await screen.findByRole("button", { name: /Sir_Kay/ })).toBeDefined();
  });

  it("says Account until the name has loaded, and if there is none to show", async () => {
    getMyProfileMock.mockResolvedValue({ displayName: null, isAnonymous: false });
    renderMenu(MEMBER);

    expect(screen.getByRole("button", { name: /^Account/ })).toBeDefined();
  });

  it("labels a guest as Guest without asking for a name", () => {
    renderMenu(GUEST);

    expect(screen.getByRole("button", { name: /^Guest/ })).toBeDefined();
    expect(getMyProfileMock).not.toHaveBeenCalled();
  });

  it("keeps the menu closed until asked", () => {
    renderMenu(MEMBER);

    expect(screen.queryByRole("link", { name: "Loadout" })).toBeNull();
  });

  it("lists Loadout, Stats, Account and Sign out for an account", async () => {
    renderMenu(MEMBER);
    fireEvent.click(await screen.findByRole("button", { name: /Sir_Kay/ }));

    expect(screen.getByRole("link", { name: "Loadout" }).getAttribute("href")).toBe("/loadout");
    expect(screen.getByRole("link", { name: "Stats" }).getAttribute("href")).toBe("/stats");
    expect(screen.getByRole("link", { name: "Account" }).getAttribute("href")).toBe("/account");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
  });

  it("invites a nameless account to choose one", async () => {
    getMyProfileMock.mockResolvedValue({ displayName: null, isAnonymous: false });
    renderMenu(MEMBER);
    fireEvent.click(trigger());

    await screen.findByRole("link", { name: "Choose a name" });
  });

  it("puts saving progress first for a guest", () => {
    renderMenu(GUEST);
    fireEvent.click(trigger());

    const items = screen.getAllByRole("link").map((link) => link.textContent);
    expect(items[0]).toBe("Save your progress");
    expect(screen.getByRole("link", { name: "Save your progress" }).getAttribute("href")).toBe(
      "/account",
    );
  });

  it("closes when a link is followed", async () => {
    const { router } = renderMenu(MEMBER);
    fireEvent.click(await screen.findByRole("button", { name: /Sir_Kay/ }));

    fireEvent.click(screen.getByRole("link", { name: "Loadout" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/loadout"));
    expect(screen.queryByRole("link", { name: "Loadout" })).toBeNull();
  });

  it("closes on Escape and gives focus back to the button", async () => {
    renderMenu(MEMBER);
    const button = await screen.findByRole("button", { name: /Sir_Kay/ });
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByRole("link", { name: "Loadout" }), { key: "Escape" });

    expect(screen.queryByRole("link", { name: "Loadout" })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("closes on a click elsewhere", async () => {
    renderMenu(MEMBER);
    fireEvent.click(await screen.findByRole("button", { name: /Sir_Kay/ }));

    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByRole("link", { name: "Loadout" })).toBeNull();
  });

  it("signs out and returns home", async () => {
    const { router } = renderMenu(MEMBER);
    fireEvent.click(await screen.findByRole("button", { name: /Sir_Kay/ }));

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("picks up a name change made elsewhere on the page", async () => {
    renderMenu(MEMBER);
    await screen.findByRole("button", { name: /Sir_Kay/ });

    getMyProfileMock.mockResolvedValue({ displayName: "Sir_Bors", isAnonymous: false });
    act(() => {
      window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
    });

    expect(await screen.findByRole("button", { name: /Sir_Bors/ })).toBeDefined();
  });

  it("still works if the profile cannot be read", async () => {
    getMyProfileMock.mockRejectedValue(new Error("offline"));
    renderMenu(MEMBER);
    fireEvent.click(trigger());

    expect(screen.getByRole("link", { name: /Account|Choose a name/ })).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
  });
});
