import { Application, type Graphics, type Sprite } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRaster } from "../viewmodel/raster.js";
import { HazardView } from "./HazardView.js";
import { WorldAtlas } from "./WorldAtlas.js";

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
      {
        id: "fire",
        kind: "fireZone",
        x: 10,
        y: 20,
        w: 30,
        h: 40,
        active: true,
        phase: "on",
        hp: 0,
        maxHp: 0,
      },
      {
        id: "floor",
        kind: "breakableFloor",
        x: 50,
        y: 60,
        w: 70,
        h: 16,
        active: true,
        phase: "solid",
        hp: 16,
        maxHp: 16,
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
      {
        id: "fire",
        kind: "fireZone",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        active: true,
        phase: "on",
        hp: 0,
        maxHp: 0,
      },
    ]);
    view.sync([
      {
        id: "fire",
        kind: "fireZone",
        x: 15,
        y: 25,
        w: 10,
        h: 10,
        active: true,
        phase: "on",
        hp: 0,
        maxHp: 0,
      },
    ]);

    expect(app.stage.children).toHaveLength(1);
    const [graphics] = app.stage.children as [Graphics];
    expect(graphics.position.x).toBe(15);
    expect(graphics.position.y).toBe(25);
  });

  it("removes graphics for hazards no longer present", () => {
    const view = new HazardView(app.stage);

    view.sync([
      {
        id: "fire",
        kind: "fireZone",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        active: true,
        phase: "on",
        hp: 0,
        maxHp: 0,
      },
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
        hp: 16,
        maxHp: 16,
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
        hp: 0,
        maxHp: 16,
      },
    ]);
    const [brokenGraphics] = app.stage.children as [Graphics];

    expect(brokenGraphics.alpha).toBeLessThan(activeAlpha);
  });
});

/** An atlas whose every frame is a flat opaque 16x16 square: enough to exercise the art path. */
function fakeAtlas(): WorldAtlas {
  const atlas = new WorldAtlas(
    { frames: {}, animations: {}, meta: { image: "", size: { w: 1, h: 1 } } },
    { w: 1, h: 1, data: new Uint8ClampedArray(4) },
  );
  const square = createRaster(16, 16);
  square.data.fill(255);
  atlas.sprite = () => square;
  return atlas;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("HazardView with world art", () => {
  let app: Application;

  beforeEach(async () => {
    app = new Application();
    await app.init({ width: 200, height: 200 });
  });

  afterEach(() => {
    app.destroy(true, { children: true });
  });

  const fire = {
    id: "fire",
    kind: "fireZone",
    x: 10,
    y: 20,
    w: 60,
    h: 40,
    active: true,
    phase: "on",
    hp: 0,
    maxHp: 0,
  };
  const floor = {
    id: "floor",
    kind: "breakableFloor",
    x: 50,
    y: 60,
    w: 70,
    h: 16,
    active: true,
    phase: "solid",
    hp: 16,
    maxHp: 16,
  };

  it("swaps the flat rects for art sprites at the hazard's box once the atlas lands", async () => {
    const view = new HazardView(app.stage, Promise.resolve(fakeAtlas()));
    view.sync([fire]);
    expect((app.stage.children[0] as Graphics).constructor.name).toBe("Graphics");

    await settle();
    view.sync([fire, floor]);

    expect(app.stage.children).toHaveLength(2);
    const [first, second] = app.stage.children as [Sprite, Sprite];
    expect(first.constructor.name).toBe("Sprite");
    expect([first.position.x, first.position.y]).toEqual([10, 20]);
    expect(first.scale.x).toBe(2);
    expect([second.position.x, second.position.y]).toEqual([50, 60]);
    // The image is the box in art pixels: 60x40 units is 30x20.
    expect([first.texture.width, first.texture.height]).toEqual([30, 20]);
    view.destroy();
  });

  it("keeps the flat rects when the atlas fails to load", async () => {
    const view = new HazardView(app.stage, Promise.resolve(null));
    await settle();
    view.sync([fire]);

    expect(app.stage.children).toHaveLength(1);
    expect((app.stage.children[0] as Graphics).constructor.name).toBe("Graphics");
  });

  it("hides a broken floor and removes sprites for hazards that are gone", async () => {
    const view = new HazardView(app.stage, Promise.resolve(fakeAtlas()));
    await settle();
    view.sync([floor]);
    const [sprite] = app.stage.children as [Sprite];
    expect(sprite.visible).toBe(true);

    view.sync([{ ...floor, active: false, phase: "broken", hp: 0 }]);
    expect(sprite.visible).toBe(false);

    view.sync([]);
    expect(app.stage.children).toHaveLength(0);
    view.destroy();
  });
});
