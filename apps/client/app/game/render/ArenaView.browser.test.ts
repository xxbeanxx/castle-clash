import { ARENA_IDS, ARENAS } from "@castle-clash/shared";
import { Application, Container } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRaster } from "../viewmodel/raster.js";
import { ArenaView } from "./ArenaView.js";
import { Backdrop } from "./Backdrop.js";
import type { SurfaceLayout } from "./surface.js";
import { WorldAtlas } from "./WorldAtlas.js";

const COLOSSEUM_ARENA = ARENAS[ARENA_IDS.COLOSSEUM];

function layout(scale: number, dpr = 1): SurfaceLayout {
  return {
    physW: 1280 * dpr,
    physH: 720 * dpr,
    scale,
    fractional: false,
    viewW: (1280 * dpr) / scale,
    viewH: (720 * dpr) / scale,
  };
}

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

describe("Backdrop", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    Object.assign(host.style, { position: "relative", width: "1280px", height: "720px" });
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  const bounds = { x: 0, y: 0, w: 1280, h: 720 };

  it("sits behind the game canvas and is pixel-art crisp", () => {
    const game = document.createElement("canvas");
    host.appendChild(game);
    const backdrop = new Backdrop(host, createRaster(640, 360), bounds);

    const el = host.querySelector<HTMLCanvasElement>('[data-testid="arena-backdrop"]')!;
    expect(host.firstElementChild).toBe(el);
    expect(el.style.imageRendering).toBe("pixelated");
    expect(el.style.zIndex).toBe("-1");
    expect([el.width, el.height]).toEqual([640, 360]);
    backdrop.destroy();
  });

  it("places the picture where the stage places the arena, one art pixel per `scale` CSS pixels", () => {
    const backdrop = new Backdrop(host, createRaster(640, 360), bounds);
    const el = host.querySelector<HTMLCanvasElement>('[data-testid="arena-backdrop"]')!;

    // 1280x720 CSS at 2x: stage scale 1 (world unit = 1 px), arena at the origin.
    backdrop.place({ scale: 1, x: 0, y: 0 }, layout(2));
    expect(el.style.transform).toBe("translate(0px, 0px) scale(2)");

    // A shake of 2 art px (4 px) moves the picture with the stage.
    backdrop.place({ scale: 1, x: 4, y: -4 }, layout(2));
    expect(el.style.transform).toBe("translate(4px, -4px) scale(2)");

    // A 2x-DPR screen: the backing store is 2560 wide but the host is still 1280 CSS px, so every
    // physical measurement halves.
    backdrop.place({ scale: 2, x: 8, y: 0 }, layout(4, 2));
    expect(el.style.transform).toBe("translate(4px, 0px) scale(2)");
    backdrop.destroy();
  });

  it("offsets by the arena's own origin, for a bounds that does not start at 0,0", () => {
    const backdrop = new Backdrop(host, createRaster(10, 10), { x: 100, y: 40, w: 20, h: 20 });
    const el = host.querySelector<HTMLCanvasElement>('[data-testid="arena-backdrop"]')!;
    backdrop.place({ scale: 1, x: 10, y: 0 }, layout(2));
    expect(el.style.transform).toBe("translate(110px, 40px) scale(2)");
    backdrop.destroy();
  });

  it("is removed on destroy", () => {
    const backdrop = new Backdrop(host, createRaster(4, 4), bounds);
    backdrop.destroy();
    expect(host.children).toHaveLength(0);
  });
});

describe("ArenaView", () => {
  let app: Application;
  let host: HTMLDivElement;

  beforeEach(async () => {
    app = new Application();
    await app.init({ width: 200, height: 200 });
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    app.destroy(true, { children: true });
    host.remove();
  });

  it("shows flat rects first, then swaps them for the backdrop once the atlas lands", async () => {
    const layer = new Container();
    app.stage.addChild(layer);
    const view = new ArenaView(layer, Promise.resolve(fakeAtlas()), host);

    view.setArena(COLOSSEUM_ARENA);
    expect(layer.children).toHaveLength(1);
    expect(host.querySelector('[data-testid="arena-backdrop"]')).toBeNull();

    await settle();
    expect(layer.children).toHaveLength(0);
    expect(host.querySelectorAll('[data-testid="arena-backdrop"]')).toHaveLength(1);

    view.destroy();
    expect(host.querySelector('[data-testid="arena-backdrop"]')).toBeNull();
  });

  it("keeps the flat rects if the atlas fails, and does not paint an arena that was replaced", async () => {
    const layer = new Container();
    app.stage.addChild(layer);
    const failed = new ArenaView(layer, Promise.resolve(null), host);
    failed.setArena(COLOSSEUM_ARENA);
    await settle();
    expect(layer.children).toHaveLength(1);
    expect(host.children).toHaveLength(0);

    const late = new ArenaView(new Container(), Promise.resolve(fakeAtlas()), host);
    late.setArena(COLOSSEUM_ARENA);
    late.destroy();
    await settle();
    expect(host.children).toHaveLength(0);
  });
});
