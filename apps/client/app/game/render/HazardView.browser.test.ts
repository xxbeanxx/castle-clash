import { Application, type Graphics } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HazardView } from "./HazardView.js";

describe("HazardView", () => {
  let app: Application;

  beforeEach(async () => {
    app = new Application();
    await app.init({ width: 200, height: 200 });
  });

  afterEach(() => {
    app.destroy(true, { children: true });
  });

  it("renders one graphic per hazard, positioned to match its box", () => {
    const view = new HazardView(app.stage);

    view.sync([
      { id: "fire", kind: "fireZone", x: 10, y: 20, w: 30, h: 40, active: true, phase: "on" },
      {
        id: "floor",
        kind: "breakableFloor",
        x: 50,
        y: 60,
        w: 70,
        h: 16,
        active: true,
        phase: "solid",
      },
    ]);

    expect(app.stage.children).toHaveLength(2);
    const [first, second] = app.stage.children as [Graphics, Graphics];
    expect(first.position.x).toBe(10);
    expect(first.position.y).toBe(20);
    expect(second.position.x).toBe(50);
    expect(second.position.y).toBe(60);
  });

  it("moves an existing hazard's graphic instead of creating a new one", () => {
    const view = new HazardView(app.stage);

    view.sync([
      { id: "fire", kind: "fireZone", x: 0, y: 0, w: 10, h: 10, active: true, phase: "on" },
    ]);
    view.sync([
      { id: "fire", kind: "fireZone", x: 15, y: 25, w: 10, h: 10, active: true, phase: "on" },
    ]);

    expect(app.stage.children).toHaveLength(1);
    const [graphics] = app.stage.children as [Graphics];
    expect(graphics.position.x).toBe(15);
    expect(graphics.position.y).toBe(25);
  });

  it("removes graphics for hazards no longer present", () => {
    const view = new HazardView(app.stage);

    view.sync([
      { id: "fire", kind: "fireZone", x: 0, y: 0, w: 10, h: 10, active: true, phase: "on" },
    ]);
    view.sync([]);

    expect(app.stage.children).toHaveLength(0);
  });

  it("dims alpha once a hazard goes inactive (broken/fallen)", () => {
    const view = new HazardView(app.stage);

    view.sync([
      {
        id: "floor",
        kind: "breakableFloor",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        active: true,
        phase: "solid",
      },
    ]);
    const [activeGraphics] = app.stage.children as [Graphics];
    const activeAlpha = activeGraphics.alpha;

    view.sync([
      {
        id: "floor",
        kind: "breakableFloor",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        active: false,
        phase: "broken",
      },
    ]);
    const [brokenGraphics] = app.stage.children as [Graphics];

    expect(brokenGraphics.alpha).toBeLessThan(activeAlpha);
  });
});
