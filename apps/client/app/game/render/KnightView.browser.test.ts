import { Application, type Sprite } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnightRect } from "../viewmodel/playersToRects.js";
import { KnightAtlas } from "./KnightAtlas.js";
import { KnightView } from "./KnightView.js";

const rect = (over: Partial<KnightRect> = {}): KnightRect => ({
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

describe("KnightView", () => {
  let app: Application;
  let atlas: KnightAtlas;
  let view: KnightView;

  beforeEach(async () => {
    app = new Application();
    await app.init({ width: 200, height: 200 });
    atlas = await KnightAtlas.load();
    view = new KnightView(app.stage, atlas);
  });

  afterEach(() => {
    app.destroy(true, { children: true });
    atlas.destroy();
  });

  const sprite = () => app.stage.children[0] as Sprite;

  it("stands the feet on the hitbox bottom and the body on its centre, on whole art pixels", () => {
    view.sync([rect({ x: 101, y: 200 })], 16);
    // centre x = 101 + 14 = 115 -> 116 (even), feet y = 200 + 48 = 248
    expect(sprite().position.x).toBe(116);
    expect(sprite().position.y).toBe(248);
    expect(sprite().scale.x).toBe(2);
    expect(sprite().scale.y).toBe(2);
  });

  it("mirrors about the body when facing left", () => {
    view.sync([rect({ facing: -1 })], 16);
    expect(sprite().scale.x).toBe(-2);
  });

  it("shows the clip and frame knightPose picks, one whole frame of the atlas", () => {
    view.sync([rect({ action: "Run", actionTick: 3 })], 16);
    const run = atlas.texturesFor(0x3a6fe0)["run"];
    expect(sprite().texture).toBe(run?.[1]); // 3 ticks at 3 ticks per frame
    expect(sprite().texture.frame.width).toBe(120);
    expect(sprite().texture.frame.height).toBe(80);
  });

  it("advances a remote knight's animation between server patches, never backwards", () => {
    view.sync([rect({ action: "Idle", actionTick: 0 })], 16);
    const first = sprite().texture;
    for (let i = 0; i < 7; i += 1) {
      view.sync([rect({ action: "Idle", actionTick: 0 })], 16.7); // no new patch, 7 ticks pass
    }
    expect(sprite().texture).not.toBe(first);
    const advanced = sprite().texture;
    view.sync([rect({ action: "Idle", actionTick: 1 })], 16.7); // a patch that lands behind
    expect(sprite().texture).toBe(advanced);
  });

  it("recolours a knight per player and leaves the base atlas untouched", () => {
    const blue = atlas.texturesFor(0x3a6fe0)["idle"]?.[0];
    const green = atlas.texturesFor(0x3fae4a)["idle"]?.[0];
    expect(blue).toBeDefined();
    expect(blue).not.toBe(green);
    expect(atlas.texturesFor(0x3a6fe0)["idle"]?.[0]).toBe(blue);
  });

  it("removes the sprite of a player who left", () => {
    view.sync([rect(), rect({ id: "p2" })], 16);
    expect(app.stage.children).toHaveLength(2);
    view.sync([rect()], 16);
    expect(app.stage.children).toHaveLength(1);
  });
});
