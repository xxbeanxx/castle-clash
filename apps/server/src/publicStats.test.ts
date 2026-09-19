import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPublicStatsRoute, type PublicStatsOptions } from "./publicStats.js";

function createApp(overrides: Partial<PublicStatsOptions> = {}) {
  const app = express();
  registerPublicStatsRoute(app, {
    read: () => ({ players: 7, rooms: 2 }),
    version: "1.2.3",
    ...overrides,
  });
  return app;
}

describe("GET /stats", () => {
  it("reports players, rooms and the server version", async () => {
    const response = await request(createApp()).get("/stats");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ players: 7, rooms: 2, version: "1.2.3" });
  });

  it("is cacheable for the cache window", async () => {
    const response = await request(createApp({ cacheMs: 5000 })).get("/stats");
    expect(response.headers["cache-control"]).toBe("public, max-age=5");
  });

  it("reads the source once per cache window, then again after it expires", async () => {
    let now = 1_000;
    const read = vi.fn(() => ({ players: 1, rooms: 1 }));
    const app = createApp({ read, cacheMs: 5000, now: () => now });

    await request(app).get("/stats");
    now += 4_999;
    await request(app).get("/stats");
    expect(read).toHaveBeenCalledTimes(1);

    now += 2;
    await request(app).get("/stats");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("answers 503 rather than throwing when the source fails, and does not cache the failure", async () => {
    let fail = true;
    const read = vi.fn(() => {
      if (fail) {
        throw new Error("presence down");
      }
      return { players: 3, rooms: 1 };
    });
    const app = createApp({ read });

    expect((await request(app).get("/stats")).status).toBe(503);
    fail = false;
    const recovered = await request(app).get("/stats");
    expect(recovered.status).toBe(200);
    expect(recovered.body.players).toBe(3);
  });

  it("accepts an async source", async () => {
    const response = await request(createApp({ read: async () => ({ players: 9, rooms: 3 }) })).get(
      "/stats",
    );
    expect(response.body).toMatchObject({ players: 9, rooms: 3 });
  });

  describe("CORS", () => {
    it("allows any origin when none are configured (the figures are public)", async () => {
      const response = await request(createApp()).get("/stats").set("Origin", "https://a.example");
      expect(response.headers["access-control-allow-origin"]).toBe("*");
    });

    it("echoes only a configured origin, and varies on Origin", async () => {
      const app = createApp({ allowedOrigins: ["https://play.example"] });

      const allowed = await request(app).get("/stats").set("Origin", "https://play.example");
      expect(allowed.headers["access-control-allow-origin"]).toBe("https://play.example");
      expect(allowed.headers["vary"]).toContain("Origin");

      const denied = await request(app).get("/stats").set("Origin", "https://evil.example");
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  it("keys the rate limit on the proxy-appended address, not one the client can forge", async () => {
    const app = createApp({ maxRequestsPerMinute: 1 });
    const get = (forged: string) =>
      request(app).get("/stats").set("X-Forwarded-For", `${forged}, 198.51.100.7`);

    expect((await get("1.1.1.1")).status).toBe(200);
    // Same real hop, different forged prefix: still the same client.
    expect((await get("2.2.2.2")).status).toBe(429);
  });

  it("rate-limits per client address", async () => {
    const app = createApp({ maxRequestsPerMinute: 2 });
    const get = () => request(app).get("/stats").set("X-Forwarded-For", "203.0.113.9");

    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(429);

    const other = await request(app).get("/stats").set("X-Forwarded-For", "203.0.113.10");
    expect(other.status).toBe(200);
  });
});
