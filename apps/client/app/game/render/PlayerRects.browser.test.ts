import { Application, type Sprite } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlayerRectsView } from "./PlayerRects.js";

describe("PlayerRectsView", () => {
  let app: Application;

  beforeEach(async () => {
    app = new Application();
    await app.init({ width: 200, height: 200 });
  });

  afterEach(() => {
    app.destroy(true, { children: true });
  });

  it("renders one sprite per rect, positioned and tinted to match", () => {
    const view = new PlayerRectsView(app.stage);

    view.sync([
      { id: "p1", x: 10, y: 20, tint: 0xff0000, action: "Idle" },
      { id: "p2", x: 30, y: 40, tint: 0x00ff00, action: "Idle" },
    ]);

    expect(app.stage.children).toHaveLength(2);

    const [first, second] = app.stage.children as [Sprite, Sprite];
    expect(first.position.x).toBe(10);
    expect(first.position.y).toBe(20);
    expect(first.tint).toBe(0xff0000);
    expect(second.position.x).toBe(30);
    expect(second.position.y).toBe(40);
    expect(second.tint).toBe(0x00ff00);
  });

  it("moves an existing player's sprite instead of creating a new one", () => {
    const view = new PlayerRectsView(app.stage);

    view.sync([{ id: "p1", x: 0, y: 0, tint: 0xffffff, action: "Idle" }]);
    view.sync([{ id: "p1", x: 15, y: 25, tint: 0xffffff, action: "Idle" }]);

    expect(app.stage.children).toHaveLength(1);
    const [sprite] = app.stage.children as [Sprite];
    expect(sprite.position.x).toBe(15);
    expect(sprite.position.y).toBe(25);
  });

  it("removes sprites for players no longer present", () => {
    const view = new PlayerRectsView(app.stage);

    view.sync([{ id: "p1", x: 0, y: 0, tint: 0xffffff, action: "Idle" }]);
    view.sync([]);

    expect(app.stage.children).toHaveLength(0);
  });

  it("overrides tint and dims alpha for combat action states", () => {
    const view = new PlayerRectsView(app.stage);

    view.sync([
      { id: "hit", x: 0, y: 0, tint: 0x00ff00, action: "HitStun" },
      { id: "block", x: 0, y: 0, tint: 0x00ff00, action: "Block" },
      { id: "dodge", x: 0, y: 0, tint: 0x00ff00, action: "Dodge" },
      { id: "dead", x: 0, y: 0, tint: 0x00ff00, action: "Dead" },
    ]);

    const [hit, block, dodge, dead] = app.stage.children as [Sprite, Sprite, Sprite, Sprite];
    expect(hit.tint).toBe(0xff4444);
    expect(block.tint).toBe(0x4488ff);
    expect(dodge.tint).toBe(0x00ff00);
    expect(dodge.alpha).toBeCloseTo(0.4);
    expect(dead.alpha).toBeCloseTo(0.3);
  });
});
