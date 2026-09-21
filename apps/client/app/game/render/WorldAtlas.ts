import { Texture } from "pixi.js";
import type { Raster } from "../viewmodel/raster.js";

/** The subset of `public/assets/world/world.json` the client reads, written by
 *  `art/world/build_atlas.py`. */
export interface WorldAtlasData {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  animations: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number } };
}

const WORLD_ASSET_DIR = "/assets/world/";

/** The world art's pixels, cut into `Raster`s by frame name. The arena and hazards are painted in
 *  software from these (`viewmodel/arenaRaster.ts`, `hazardRaster.ts`), so they are auto-tiled from
 *  the arena's geometry rather than laid out by hand. */
export class WorldAtlas {
  readonly data: WorldAtlasData;
  readonly #pixels: { w: number; h: number; data: Uint8ClampedArray };
  readonly #cache = new Map<string, Raster>();

  constructor(data: WorldAtlasData, pixels: { w: number; h: number; data: Uint8ClampedArray }) {
    this.data = data;
    this.#pixels = pixels;
  }

  static async load(dir = WORLD_ASSET_DIR): Promise<WorldAtlas> {
    const jsonRes = await fetch(`${dir}world.json`);
    if (!jsonRes.ok) {
      throw new Error(`world.json: HTTP ${jsonRes.status}`);
    }
    const data = (await jsonRes.json()) as WorldAtlasData;
    const pngRes = await fetch(`${dir}${data.meta.image}`);
    if (!pngRes.ok) {
      throw new Error(`${data.meta.image}: HTTP ${pngRes.status}`);
    }
    const bitmap = await createImageBitmap(await pngRes.blob(), { premultiplyAlpha: "none" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("no 2d canvas context");
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return new WorldAtlas(data, { w: image.width, h: image.height, data: image.data });
  }

  /** The named frame's pixels (cached; treat as read-only). Throws for a name the atlas lacks,
   *  which `worldAtlas.test.ts` prevents for every name the code uses. */
  sprite = (name: string): Raster => {
    const hit = this.#cache.get(name);
    if (hit) {
      return hit;
    }
    const f = this.data.frames[name]?.frame;
    if (!f) {
      throw new Error(`world atlas has no frame ${name}`);
    }
    const out = new Uint8ClampedArray(f.w * f.h * 4);
    for (let y = 0; y < f.h; y++) {
      const from = ((f.y + y) * this.#pixels.w + f.x) * 4;
      out.set(this.#pixels.data.subarray(from, from + f.w * 4), y * f.w * 4);
    }
    const raster = { w: f.w, h: f.h, data: out };
    this.#cache.set(name, raster);
    return raster;
  };
}

/** Uploads a painted `Raster` as a nearest-neighbour Pixi texture (the caller owns and destroys it). */
export function rasterTexture(raster: Raster): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = raster.w;
  canvas.height = raster.h;
  const image = new ImageData(new Uint8ClampedArray(raster.data), raster.w, raster.h);
  canvas.getContext("2d")?.putImageData(image, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}
