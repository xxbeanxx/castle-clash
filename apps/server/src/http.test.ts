import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerHealthRoutes } from "./http.js";

function createApp() {
  const app = express();
  registerHealthRoutes(app);
  return app;
}

describe("registerHealthRoutes", () => {
  it("returns 200 from /healthz", async () => {
    const response = await request(createApp()).get("/healthz");
    expect(response.status).toBe(200);
  });

  it("returns 200 from /readyz", async () => {
    const response = await request(createApp()).get("/readyz");
    expect(response.status).toBe(200);
  });
});
