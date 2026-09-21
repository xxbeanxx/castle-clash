import { Application, Container, type Sprite } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnightRect } from "../viewmodel/playersToRects.js";
import { KnightAtlas } from "./KnightAtlas.js";
import { createPlayerRenderer } from "./PlayerRenderer.js";

const rect: KnightRect = {
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
};

describe("createPlayerRenderer", () => {
  let app: Application;
  let players: Container;
  let cosmetics: Container;

  beforeEach(async () => {
    app = new Application();
    await app.init({ width: 200, height: 200 });
    players = new Container();
    cosmetics = new Container();
    app.stage.addChild(players, cosmetics);
  });

  afterEach(() => {
    app.destroy(true, { children: true });
  });

  it("draws nothing until the atlas has loaded, then draws the knight art", async () => {
    const atlas = await KnightAtlas.load();
    let resolve!: (a: KnightAtlas) => void;
    const renderer = createPlayerRenderer(
      players,
      cosmetics,
      new Promise<KnightAtlas>((r) => (resolve = r)),
    );

    renderer.sync([rect], 16);
    expect(players.children).toHaveLength(0);

    resolve(atlas);
    await Promise.resolve();
    renderer.sync([rect], 16);
    expect(players.children).toHaveLength(1);
    expect((players.children[0] as Sprite).texture.frame.width).toBe(120);
    renderer.destroy();
  });

  it("falls back to tinted rects when the atlas fails to load", async () => {
    const renderer = createPlayerRenderer(players, cosmetics, Promise.resolve(null));
    await Promise.resolve();
    renderer.sync([rect], 16);
    const sprite = players.children[0] as Sprite;
    expect(sprite.width).toBe(32);
    expect(sprite.tint).toBe(0x3a6fe0);
  });

  it("frees an atlas that arrives after destroy() instead of drawing with it", async () => {
    const atlas = await KnightAtlas.load();
    let resolve!: (a: KnightAtlas) => void;
    const renderer = createPlayerRenderer(
      players,
      cosmetics,
      new Promise<KnightAtlas>((r) => (resolve = r)),
    );
    renderer.destroy();
    resolve(atlas);
    await Promise.resolve();
    renderer.sync([rect], 16);
    expect(players.children).toHaveLength(0);
  });
});
