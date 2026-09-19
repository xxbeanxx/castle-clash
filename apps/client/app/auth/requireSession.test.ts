import { afterEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "./requireSession.js";

const getSessionMock = vi.fn();
vi.mock("./supabase.js", () => ({ getSession: () => getSessionMock() }));

afterEach(() => getSessionMock.mockReset());

async function thrown(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    return error as Response;
  }
  throw new Error("expected a redirect to be thrown");
}

describe("requireSession", () => {
  it("returns the session when there is one", async () => {
    const session = { access_token: "t" };
    getSessionMock.mockResolvedValue(session);
    expect(await requireSession(new Request("https://app.example/lobby"))).toBe(session);
  });

  it("redirects to /login with the requested path in ?next=", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await thrown(requireSession(new Request("https://app.example/stats")));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login?next=%2Fstats");
  });

  it("keeps a private-room link's query through the login redirect", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await thrown(
      requireSession(new Request("https://app.example/play/new?mode=private&code=ABC123")),
    );
    const next = new URL(
      response.headers.get("Location") ?? "",
      "https://app.example",
    ).searchParams.get("next");
    expect(next).toBe("/play/new?mode=private&code=ABC123");
  });
});
