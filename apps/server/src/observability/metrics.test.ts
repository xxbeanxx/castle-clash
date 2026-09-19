import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { recordMatchFailureCount } from "../persistence/RecordMatchQueue.js";
import {
  registerMetricsRoute,
  registry,
  removeRoomPhase,
  setRoomPhase,
  tickDurationSeconds,
} from "./metrics.js";

function createApp() {
  const app = express();
  registerMetricsRoute(app);
  return app;
}

describe("registerMetricsRoute", () => {
  afterEach(() => {
    registry.resetMetrics();
    recordMatchFailureCount.value = 0;
  });

  it("serves Prometheus text format from /metrics", async () => {
    const response = await request(createApp()).get("/metrics");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
  });

  it("reports CCU as a gauge", async () => {
    const response = await request(createApp()).get("/metrics");
    expect(response.text).toContain("castle_clash_ccu");
  });

  it("updates rooms-by-phase counts as setRoomPhase/removeRoomPhase are called", async () => {
    setRoomPhase("room-1", "RoundActive");
    setRoomPhase("room-2", "Waiting");

    const response = await request(createApp()).get("/metrics");
    expect(response.text).toContain('castle_clash_rooms_by_phase{phase="RoundActive"} 1');
    expect(response.text).toContain('castle_clash_rooms_by_phase{phase="Waiting"} 1');

    removeRoomPhase("room-1");
    const afterRemove = await request(createApp()).get("/metrics");
    expect(afterRemove.text).toContain('castle_clash_rooms_by_phase{phase="RoundActive"} 0');
  });

  it("moves a room's count to the new phase label when it transitions", async () => {
    setRoomPhase("room-3", "Waiting");
    setRoomPhase("room-3", "Countdown");

    const response = await request(createApp()).get("/metrics");
    expect(response.text).toContain('castle_clash_rooms_by_phase{phase="Waiting"} 0');
    expect(response.text).toContain('castle_clash_rooms_by_phase{phase="Countdown"} 1');
  });

  it("is a no-op when setRoomPhase is called again with the same phase", async () => {
    setRoomPhase("room-4", "RoundActive");
    setRoomPhase("room-4", "RoundActive");

    const response = await request(createApp()).get("/metrics");
    expect(response.text).toContain('castle_clash_rooms_by_phase{phase="RoundActive"} 1');
  });

  it("records tick durations into the histogram", async () => {
    tickDurationSeconds.observe(0.01);

    const response = await request(createApp()).get("/metrics");
    expect(response.text).toContain("castle_clash_tick_duration_seconds_bucket");
    expect(response.text).toContain("castle_clash_tick_duration_seconds_count 1");
  });

  it("samples recordMatchFailureCount live on every scrape", async () => {
    recordMatchFailureCount.value = 3;
    const response = await request(createApp()).get("/metrics");
    expect(response.text).toContain("castle_clash_record_match_failures_total 3");

    recordMatchFailureCount.value = 5;
    const secondScrape = await request(createApp()).get("/metrics");
    expect(secondScrape.text).toContain("castle_clash_record_match_failures_total 5");
  });
});
