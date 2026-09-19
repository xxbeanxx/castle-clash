import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientLoadout } from "../auth/supabase.js";
import Loadout, { clientLoader } from "./loadout.js";

const getSessionMock = vi.fn().mockResolvedValue({ access_token: "test-access-token" });
const getMyLoadoutMock = vi.fn();
const getMyUnlocksMock = vi.fn();
const saveMyLoadoutMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/supabase.js", () => ({
  getSession: () => getSessionMock(),
  getMyLoadout: () => getMyLoadoutMock(),
  getMyUnlocks: () => getMyUnlocksMock(),
  saveMyLoadout: (loadout: ClientLoadout) => saveMyLoadoutMock(loadout),
}));

vi.mock("../ui/LoadoutPreview.js", () => ({
  LoadoutPreview: () => <div data-testid="loadout-preview-stub" />,
}));

const DEFAULT_LOADOUT: ClientLoadout = {
  weapon: "sword",
  tintPrimary: 0xffffff,
  tintSecondary: 0xffffff,
  helmetId: null,
  capeId: null,
  weaponStyleId: null,
};

function renderLoadout() {
  const router = createMemoryRouter(
    [
      { path: "/loadout", Component: Loadout, loader: clientLoader },
      { path: "/login", Component: () => <p>login route</p> },
    ],
    { initialEntries: ["/loadout"] },
  );
  render(<RouterProvider router={router} />);
  return { router };
}

describe("Loadout route", () => {
  afterEach(() => {
    cleanup();
    getSessionMock.mockReset().mockResolvedValue({ access_token: "test-access-token" });
    getMyLoadoutMock.mockReset().mockResolvedValue(DEFAULT_LOADOUT);
    getMyUnlocksMock.mockReset().mockResolvedValue([]);
    saveMyLoadoutMock.mockReset().mockResolvedValue(undefined);
  });

  it("redirects to /login when clientLoader runs with no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const { router } = renderLoadout();

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("renders every catalog item for a slot, disabling the ones the player doesn't own", async () => {
    getMyUnlocksMock.mockResolvedValue(["helmet-bronze"]);
    renderLoadout();

    await waitFor(() =>
      expect((screen.getByText("Bronze Helm") as HTMLButtonElement).disabled).toBe(false),
    );
    expect((screen.getByText(/Silver Helm/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("selects an owned item on click, and saves it with the rest of the loadout", async () => {
    getMyUnlocksMock.mockResolvedValue(["helmet-bronze"]);
    renderLoadout();

    const bronzeButton = await screen.findByText("Bronze Helm");
    fireEvent.click(bronzeButton);

    const saveButton = screen.getByText("Save loadout");
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(saveMyLoadoutMock).toHaveBeenCalledWith({
        ...DEFAULT_LOADOUT,
        helmetId: "helmet-bronze",
      }),
    );
  });

  it("saves the current loadout when Save is clicked", async () => {
    renderLoadout();

    const saveButton = await screen.findByText("Save loadout");
    fireEvent.click(saveButton);

    await waitFor(() => expect(saveMyLoadoutMock).toHaveBeenCalledWith(DEFAULT_LOADOUT));
    await waitFor(() => expect(screen.getByText("Saved.")).toBeDefined());
  });

  it("shows an error message when saving fails with a real Error", async () => {
    saveMyLoadoutMock.mockRejectedValue(new Error("network down"));
    renderLoadout();

    const saveButton = await screen.findByText("Save loadout");
    fireEvent.click(saveButton);

    await waitFor(() => expect(screen.getByText(/Failed to save: network down/)).toBeDefined());
  });

  it("extracts a readable message from a plain PostgrestError-shaped rejection", async () => {
    // supabase-js's `.upsert()` rejects with a plain object (RLS/FK
    // violations, etc.), not an `Error` instance — this is the shape that
    // regressed to literal "[object Object]" before `errorMessage()` (see
    // its doc comment) checked for a string `.message` on any object, not
    // just `instanceof Error`.
    saveMyLoadoutMock.mockRejectedValue({
      code: "23503",
      message: 'insert or update on table "player_loadouts" violates foreign key constraint',
    });
    renderLoadout();

    const saveButton = await screen.findByText("Save loadout");
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(screen.getByText(/Failed to save: insert or update on table/)).toBeDefined(),
    );
  });
});
