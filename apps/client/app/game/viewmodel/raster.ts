/** A block of RGBA pixels (row-major, 4 bytes each). Used both for sprites cut out of the atlas and
 *  for the images the world is painted into, so the painters below are plain functions over bytes
 *  and run in Node tests without a canvas. */
export interface Raster {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;
}

export type Rgb = readonly [number, number, number];

export function createRaster(w: number, h: number): Raster {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

/** Straight-alpha "over" of `src` onto `dst` at (`x`, `y`), clipped to `dst`. `dim` multiplies the
 *  source colour (props sit behind the players, so they are drawn darker). Sprites here are
 *  unantialiased (alpha 0 or 255), so this only needs the two cases. */
export function blit(dst: Raster, src: Raster, x: number, y: number, dim = 1): void {
  for (let sy = 0; sy < src.h; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= dst.h) {
      continue;
    }
    for (let sx = 0; sx < src.w; sx++) {
      const dx = x + sx;
      if (dx < 0 || dx >= dst.w) {
        continue;
      }
      const s = (sy * src.w + sx) * 4;
      if ((src.data[s + 3] ?? 0) === 0) {
        continue;
      }
      const d = (dy * dst.w + dx) * 4;
      dst.data[d] = (src.data[s] ?? 0) * dim;
      dst.data[d + 1] = (src.data[s + 1] ?? 0) * dim;
      dst.data[d + 2] = (src.data[s + 2] ?? 0) * dim;
      dst.data[d + 3] = 255;
    }
  }
}

export function setPixel(dst: Raster, x: number, y: number, [r, g, b]: Rgb, alpha = 255): void {
  if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) {
    return;
  }
  const i = (y * dst.w + x) * 4;
  dst.data[i] = r;
  dst.data[i + 1] = g;
  dst.data[i + 2] = b;
  dst.data[i + 3] = alpha;
}

export function pixelAt(src: Raster, x: number, y: number): [number, number, number, number] {
  const i = (y * src.w + x) * 4;
  return [src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0, src.data[i + 3] ?? 0];
}
