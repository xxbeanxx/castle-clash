import { describe, expect, it, vi } from "vitest";
import { fetchServerStats } from "./serverStats.js";

const ok = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("fetchServerStats", () => {
  it("reads /stats from the HTTP twin of the game server URL", async () => {
    const fetchImpl = ok({ players: 12, rooms: 3, version: "1.1.0" });
    const stats = await fetchServerStats("wss://game.example.com/", fetchImpl);

    expect(stats).toEqual({ players: 12, rooms: 3, version: "1.1.0" });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://game.example.com/stats");
  });

  it("returns null for a non-2xx answer", async () => {
    expect(await fetchServerStats("ws://x", ok({}, 503))).toBeNull();
    expect(await fetchServerStats("ws://x", ok({}, 429))).toBeNull();
  });

  it("returns null for a body of the wrong shape", async () => {
    expect(await fetchServerStats("ws://x", ok({ players: "lots" }))).toBeNull();
    expect(await fetchServerStats("ws://x", ok(null))).toBeNull();
  });

  it("returns null when the network fails, instead of throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchServerStats("ws://x", fetchImpl)).toBeNull();
  });

  it("returns null when the body is not JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }));
    expect(await fetchServerStats("ws://x", fetchImpl)).toBeNull();
  });

  it("gives up on a hung request after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted")));
          }),
      );
      const pending = fetchServerStats("ws://x", fetchImpl as unknown as typeof fetch);
      await vi.advanceTimersByTimeAsync(4_001);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
