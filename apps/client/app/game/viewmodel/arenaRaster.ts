import type { AABB, ArenaDefinition } from "@castle-clash/shared";
import type { ArenaTheme, SpriteSource } from "./arenaThemes.js";
import { blit, createRaster, setPixel, type Raster, type Rgb } from "./raster.js";

/** One unit of world space is half an art pixel (docs/adr/0002-render-surface.md). */
export const UNITS_PER_ART_PX = 2;

/** How a block of terrain is painted: a tiled fill, a lit cap under the top edge, and a 1 px outline
 *  on every edge that borders empty space. Light comes from the top-left, so the right and bottom
 *  faces get a darker inner row (docs/art/BIBLE.md). */
export interface BlockStyle {
  readonly fill: Raster;
  /** Rows of highlight just inside the top outline, brightest first. */
  readonly cap: readonly Rgb[];
  readonly outline: Rgb;
  /** Brightness multiplier of the inner row along the right and bottom faces. */
  readonly shade: number;
  /** Multiplies the whole fill, to keep a bright pattern (sand) from outshining the knights. */
  readonly brightness: number;
}

/** A run length longer than any arena, for an edge that is not an edge (the world's border). */
const FAR = 0xffff;

export function toArtBox(box: AABB): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(box.x / UNITS_PER_ART_PX),
    y: Math.round(box.y / UNITS_PER_ART_PX),
    w: Math.round(box.w / UNITS_PER_ART_PX),
    h: Math.round(box.h / UNITS_PER_ART_PX),
  };
}

export function maskFromBoxes(w: number, h: number, boxes: readonly AABB[]): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (const box of boxes) {
    const b = toArtBox(box);
    for (let y = Math.max(0, b.y); y < Math.min(h, b.y + b.h); y++) {
      for (let x = Math.max(0, b.x); x < Math.min(w, b.x + b.w); x++) {
        mask[y * w + x] = 1;
      }
    }
  }
  return mask;
}

/**
 * Paints every set pixel of `mask` into `target`. The picture is a pure function of the mask, and the
 * mask comes from `ArenaDefinition`'s boxes, so what is drawn can never disagree with what collides
 * (plan step 11). Where two boxes touch (a wall meeting the floor) there is no outline between
 * them, because edges are found on the union, not per box.
 *
 * `outsideSolid` says what lies beyond the raster: true for the world (a wall at the screen edge has
 * no outline there), false for a block painted on its own (a hazard's floor tile).
 */
export function paintBlocks(
  target: Raster,
  mask: Uint8Array,
  style: BlockStyle,
  outsideSolid: boolean,
): void {
  const { w, h } = target;
  // For each pixel: how many solid pixels lie contiguously beyond it in that direction (0: the very
  // next pixel is empty, so this one is on that face).
  const up = new Uint16Array(w * h);
  const down = new Uint16Array(w * h);
  const left = new Uint16Array(w * h);
  const right = new Uint16Array(w * h);
  const edge = outsideSolid ? FAR : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) {
        continue;
      }
      up[i] = y === 0 ? edge : mask[i - w] ? Math.min(FAR, (up[i - w] ?? 0) + 1) : 0;
      left[i] = x === 0 ? edge : mask[i - 1] ? Math.min(FAR, (left[i - 1] ?? 0) + 1) : 0;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) {
        continue;
      }
      down[i] = y === h - 1 ? edge : mask[i + w] ? Math.min(FAR, (down[i + w] ?? 0) + 1) : 0;
      right[i] = x === w - 1 ? edge : mask[i + 1] ? Math.min(FAR, (right[i + 1] ?? 0) + 1) : 0;
    }
  }

  const { fill } = style;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) {
        continue;
      }
      const u = up[i] ?? 0;
      const d = down[i] ?? 0;
      const l = left[i] ?? 0;
      const r = right[i] ?? 0;
      if (u === 0 || d === 0 || l === 0 || r === 0) {
        setPixel(target, x, y, style.outline);
      } else if (u <= style.cap.length) {
        setPixel(target, x, y, style.cap[u - 1] ?? style.outline);
      } else {
        // The fill is anchored to the world, so a wall and the floor beside it share one pattern.
        const f = ((y % fill.h) * fill.w + (x % fill.w)) * 4;
        const shade = (d === 1 || r === 1 ? style.shade : 1) * style.brightness;
        target.data[i * 4] = (fill.data[f] ?? 0) * shade;
        target.data[i * 4 + 1] = (fill.data[f + 1] ?? 0) * shade;
        target.data[i * 4 + 2] = (fill.data[f + 2] ?? 0) * shade;
        target.data[i * 4 + 3] = 255;
      }
    }
  }
}

/** A `w` x `h` (art px) block painted on its own, e.g. a breakable floor or a collapsing platform. */
export function renderBlock(w: number, h: number, style: BlockStyle): Raster {
  const target = createRaster(w, h);
  paintBlocks(target, new Uint8Array(w * h).fill(1), style, false);
  return target;
}

/** The arena's solids and one-way platforms, on a transparent raster the size of its bounds. */
export function renderTerrain(
  arena: ArenaDefinition,
  theme: ArenaTheme,
  sprite: SpriteSource,
): Raster {
  const bounds = toArtBox(arena.bounds);
  const target = createRaster(bounds.w, bounds.h);
  paintBlocks(
    target,
    maskFromBoxes(bounds.w, bounds.h, arena.solids),
    blockStyle(theme.solid, sprite),
    true,
  );
  paintBlocks(
    target,
    maskFromBoxes(bounds.w, bounds.h, arena.platforms),
    blockStyle(theme.platform, sprite),
    false,
  );
  return target;
}

export function blockStyle(spec: ArenaTheme["solid"], sprite: SpriteSource): BlockStyle {
  return {
    fill: sprite(spec.fill),
    cap: spec.cap,
    outline: OUTLINE,
    shade: spec.shade,
    brightness: spec.brightness ?? 1,
  };
}

/** The shared darkest colour (`art/world/build_atlas.py`'s `OUTLINE`, the knight's own). */
export const OUTLINE: Rgb = [0x1a, 0x0e, 0x13];

/** The wall behind everything: a dimmed, tinted fill, a vignette, and the theme's props. */
export function renderBackground(
  arena: ArenaDefinition,
  theme: ArenaTheme,
  sprite: SpriteSource,
): Raster {
  const { w, h } = toArtBox(arena.bounds);
  const target = createRaster(w, h);
  const fill = sprite(theme.background.fill);
  const { tint, dim } = theme.background;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Darker toward the edges, so the eye stays on the middle where the fight is.
      const nx = (x / w - 0.5) * 2;
      const ny = (y / h - 0.5) * 2;
      const vignette = 1 - 0.22 * Math.min(1, (nx * nx + ny * ny) / 2);
      const f = ((y % fill.h) * fill.w + (x % fill.w)) * 4;
      const i = (y * w + x) * 4;
      target.data[i] = ((fill.data[f] ?? 0) * tint[0] * dim * vignette) / 255;
      target.data[i + 1] = ((fill.data[f + 1] ?? 0) * tint[1] * dim * vignette) / 255;
      target.data[i + 2] = ((fill.data[f + 2] ?? 0) * tint[2] * dim * vignette) / 255;
      target.data[i + 3] = 255;
    }
  }
  for (const prop of theme.props) {
    blit(target, sprite(prop.sprite), prop.x, prop.y, theme.background.propDim);
  }
  return target;
}

const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** A drop or pit: near-black, with a dithered red glow along its top edge so it reads as "do not
 *  go in". No atlas art needed. */
export function renderAbyss(w: number, h: number): Raster {
  const target = createRaster(w, h);
  // A tall, narrow drop has no "top edge" worth marking; only a pit gets the glow.
  const glowRows = h > 2 * w ? 0 : 10;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const glow = Math.max(0, 1 - y / glowRows);
      const threshold = (BAYER_4[(y % 4) * 4 + (x % 4)] ?? 0) / 16;
      const lit = threshold < glow;
      setPixel(target, x, y, lit ? [0x3f, 0x26, 0x31] : [0x0c, 0x06, 0x09]);
    }
  }
  return target;
}
