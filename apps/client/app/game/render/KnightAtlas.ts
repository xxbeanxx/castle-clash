import { Rectangle, Texture } from "pixi.js";
import { applyPaletteSwap, playerSwap } from "./paletteSwap.js";

/** The subset of `public/assets/knight/knight.json` the client reads. Written by
 *  `art/knight/build_atlas.py`; Pixi's own `Assets` spritesheet loader is not used because it
 *  cannot recolour, and because this loader keeps every player's texture set on one shared bitmap. */
export interface KnightAtlasData {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  animations: Record<string, string[]>;
  meta: {
    image: string;
    frameSize: { w: number; h: number };
    pivot: { x: number; y: number };
  };
}

export type ClipTextures = Readonly<Record<string, readonly Texture[]>>;

const KNIGHT_ASSET_DIR = "/assets/knight/";

/** The knight's frames, with one recoloured copy per player colour (`paletteSwap.ts`). Textures are
 *  built lazily and cached by colour, so a match costs one canvas per distinct player colour. */
export class KnightAtlas {
  readonly data: KnightAtlasData;
  readonly #pixels: ImageData;
  readonly #cache = new Map<number | "base", { textures: ClipTextures; base: Texture }>();

  private constructor(data: KnightAtlasData, pixels: ImageData) {
    this.data = data;
    this.#pixels = pixels;
  }

  static async load(dir = KNIGHT_ASSET_DIR): Promise<KnightAtlas> {
    const jsonRes = await fetch(`${dir}knight.json`);
    if (!jsonRes.ok) {
      throw new Error(`knight.json: HTTP ${jsonRes.status}`);
    }
    const data = (await jsonRes.json()) as KnightAtlasData;
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
    return new KnightAtlas(data, ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  /** Frame textures per clip for a player of colour `rgb` (`undefined`: the pack's own colours). */
  texturesFor(rgb?: number): ClipTextures {
    const key = rgb === undefined ? "base" : rgb;
    const hit = this.#cache.get(key);
    if (hit) {
      return hit.textures;
    }
    const pixels = new ImageData(
      new Uint8ClampedArray(this.#pixels.data),
      this.#pixels.width,
      this.#pixels.height,
    );
    if (rgb !== undefined) {
      applyPaletteSwap(pixels.data, playerSwap(rgb));
    }
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas.getContext("2d")?.putImageData(pixels, 0, 0);
    const base = Texture.from(canvas);
    base.source.scaleMode = "nearest";

    const byFrame = new Map<string, Texture>();
    const frameTexture = (name: string): Texture => {
      const cached = byFrame.get(name);
      if (cached) {
        return cached;
      }
      const f = this.data.frames[name]?.frame;
      if (!f) {
        throw new Error(`knight atlas has no frame ${name}`);
      }
      const texture = new Texture({
        source: base.source,
        frame: new Rectangle(f.x, f.y, f.w, f.h),
      });
      byFrame.set(name, texture);
      return texture;
    };
    const textures: Record<string, Texture[]> = {};
    for (const [clip, names] of Object.entries(this.data.animations)) {
      textures[clip] = names.map(frameTexture);
    }
    this.#cache.set(key, { textures, base });
    return textures;
  }

  destroy(): void {
    for (const { textures, base } of this.#cache.values()) {
      // A frame is shared by every clip that names it, so destroy each texture once.
      for (const t of new Set(Object.values(textures).flat())) {
        t.destroy();
      }
      base.destroy(true);
    }
    this.#cache.clear();
  }
}
