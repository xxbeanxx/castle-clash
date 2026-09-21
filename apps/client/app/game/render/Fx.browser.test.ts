import { Application, Container, type Sprite } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnightRect } from "../viewmodel/playersToRects.js";
import { Fx } from "./Fx.js";

const knight = (over: Partial<KnightRect> = {}): KnightRect => ({
  id: "p1",
  x: 100,
  y: 200,
  tint: 0x3a6fe0,
  action: "Idle",
  actionTick: 0,
  attackKind: "",
  weapon: "sword",
  facing: 1,
  vy: 0,
  name: "Guest-1",
  isLocal: false,
  ...over,
});

describe("Fx", () => {
  let app: Application;
  let layer: Container;

  beforeEach(async () => {
    app = new Application();
    await app.init({ width: 200, height: 200 });
    layer = new Container();
    app.stage.addChild(layer);
  });

  afterEach(() => {
    app.destroy(true, { children: true });
  });

  it("creates its whole pool up front and never grows it", () => {
    const fx = new Fx(layer, 32);
    expect(layer.children).toHaveLength(32);
    for (let i = 0; i < 20; i++) {
      fx.spawn([{ kind: "guardBreak", x: 50, y: 50, dir: 1 }]);
    }
    expect(layer.children).toHaveLength(32);
    expect(fx.active).toBe(32);
    fx.destroy();
  });

  it("shows a burst, keeps its particles on whole art pixels, and hides them when they die", () => {
    const fx = new Fx(layer);
    fx.spawn([{ kind: "hit", x: 51, y: 77, dir: 1 }]);
    expect(fx.active).toBe(10);
    const shown = (layer.children as Sprite[]).filter((s) => s.visible);
    expect(shown).toHaveLength(10);
    for (const s of shown) {
      expect(s.position.x % 2).toBe(0);
      expect(s.position.y % 2).toBe(0);
      expect(s.width % 2).toBe(0);
    }

    fx.update(16);
    expect(fx.active).toBe(10);
    fx.update(2000);
    expect(fx.active).toBe(0);
    expect((layer.children as Sprite[]).some((s) => s.visible)).toBe(false);
    fx.destroy();
  });

  it("reuses freed sprites for the next burst", () => {
    const fx = new Fx(layer, 16);
    fx.spawn([{ kind: "hit", x: 0, y: 0, dir: 1 }]);
    fx.update(2000);
    fx.spawn([{ kind: "hit", x: 0, y: 0, dir: 1 }]);
    expect(fx.active).toBe(10);
    expect(layer.children).toHaveLength(16);
    fx.destroy();
  });

  it("puffs dust behind a running knight and stops when it stops", () => {
    const fx = new Fx(layer);
    fx.ambient([knight({ action: "Run" })], 16);
    expect(fx.active).toBeGreaterThan(0);
    fx.update(2000);
    fx.ambient([knight({ action: "Idle" })], 16);
    expect(fx.active).toBe(0);
    fx.destroy();
  });
});
