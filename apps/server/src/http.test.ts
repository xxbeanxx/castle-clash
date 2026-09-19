import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerHealthRoutes } from "./http.js";

function createApp(isDraining?: () => boolean) {
  const app = express();
  registerHealthRoutes(app, isDraining);
  return app;
}

describe("registerHealthRoutes", () => {
  it("returns 200 from /healthz", async () => {
    const response = await request(createApp()).get("/healthz");
    expect(response.status).toBe(200);
  });

  it("reports the running server version from /healthz, so a deploy smoke can confirm which image is live", async () => {
    const app = express();
    registerHealthRoutes(app, () => false, "1.2.3");
    const response = await request(app).get("/healthz");
    expect(response.body).toEqual({ status: "ok", version: "1.2.3" });
  });

  it("returns 200 from /readyz", async () => {
    const response = await request(createApp()).get("/readyz");
    expect(response.status).toBe(200);
  });

  it("returns 503 from /readyz while draining (plan Phase 10 step 1)", async () => {
    const response = await request(createApp(() => true)).get("/readyz");
    expect(response.status).toBe(503);
  });

  it("still returns 200 from /healthz while draining — it's liveness, not readiness", async () => {
    const response = await request(createApp(() => true)).get("/healthz");
    expect(response.status).toBe(200);
  });
});
