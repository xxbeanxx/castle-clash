import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { InMemoryPlayerRepository } from "./persistence/InMemoryPlayerRepository.js";
import { registerSmokeRoutes, SMOKE_MODE } from "./smokeRoutes.js";

const TOKEN = "smoke-secret-value";

function createApp(overrides: { repository?: InMemoryPlayerRepository; smokeToken?: string } = {}) {
  const repository = overrides.repository ?? new InMemoryPlayerRepository();
  const app = express();
  registerSmokeRoutes(app, {
    smokeToken: overrides.smokeToken ?? TOKEN,
    verifyToken: async (token) => {
      if (!token) {
        throw new Error("missing auth token");
      }
      return { userId: token, isAnonymous: true };
    },
    repository,
    serverVersion: "9.9.9",
  });
  return { app, repository };
}

describe("POST /smoke/record-match", () => {
  it("records a smoke-mode match for the authenticated user and reports the version", async () => {
    const recorded: unknown[] = [];
    const repository = new InMemoryPlayerRepository();
    repository.recordMatch = async (result) => {
      recorded.push(result);
    };
    const { app } = createApp({ repository });

    const response = await request(app)
      .post("/smoke/record-match")
      .set("x-smoke-token", TOKEN)
      .set("authorization", "Bearer user-1");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ serverVersion: "9.9.9" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      mode: SMOKE_MODE,
      serverVersion: "9.9.9",
      winnerId: "user-1",
      participants: [{ playerId: "user-1", placement: 1 }],
    });
    expect((recorded[0] as { matchId: string }).matchId).toBe(response.body.matchId);
  });

  it("rejects a wrong or missing smoke token with 403, before touching the repository", async () => {
    let called = false;
    const repository = new InMemoryPlayerRepository();
    repository.recordMatch = async () => {
      called = true;
    };
    const { app } = createApp({ repository });

    const wrong = await request(app)
      .post("/smoke/record-match")
      .set("x-smoke-token", "nope")
      .set("authorization", "Bearer user-1");
    const missing = await request(app)
      .post("/smoke/record-match")
      .set("authorization", "Bearer user-1");

    expect(wrong.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(called).toBe(false);
  });

  it("rejects an unauthenticated caller with 401 even when the smoke token is right", async () => {
    const { app } = createApp();
    const response = await request(app).post("/smoke/record-match").set("x-smoke-token", TOKEN);
    expect(response.status).toBe(401);
  });

  it("returns 502 when the write fails, so a broken Supabase link fails the deploy", async () => {
    const repository = new InMemoryPlayerRepository();
    repository.recordMatch = async () => {
      throw new Error("supabase unreachable");
    };
    const { app } = createApp({ repository });

    const response = await request(app)
      .post("/smoke/record-match")
      .set("x-smoke-token", TOKEN)
      .set("authorization", "Bearer user-1");

    expect(response.status).toBe(502);
  });
});

describe("registerSmokeRoutes with no token configured", () => {
  it("registers nothing, so the endpoint is a plain 404 in a normal deployment", async () => {
    const app = express();
    registerSmokeRoutes(app, {
      smokeToken: undefined,
      verifyToken: async () => ({ userId: "x", isAnonymous: true }),
      repository: new InMemoryPlayerRepository(),
      serverVersion: "1.0.0",
    });
    const response = await request(app)
      .post("/smoke/record-match")
      .set("x-smoke-token", "anything");
    expect(response.status).toBe(404);
  });
});
