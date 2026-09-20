import type { AABB } from "@castle-clash/shared";

/**
 * The render surface, per ADR 0002 (`docs/adr/0002-render-surface.md`): the world is drawn on a
 * 640x360 grid of art pixels (1 art pixel = 2 world units), presented at the largest integer
 * scale that fits the physical screen, with the surplus shown as overscan. Pure functions only, so
 * the (CSS size, DPR) table can be tested exhaustively; nothing here touches the DOM or Pixi.
 */
export const ART_W = 640;
export const ART_H = 360;
export const WORLD_UNITS_PER_ART_PX = 2;
/** Above this the fill-rate cost buys nothing visible: 3x of 640x360 is already 1080p. A
 *  performance lever (Phase 13 step 12) can lower it; it is not a quality knob. */
export const MAX_DPR = 3;

export interface SurfaceLayout {
  /** Backing-store size in physical pixels. */
  physW: number;
  physH: number;
  /** Physical pixels per art pixel: a whole number >= 1, or fractional only when the screen is
   *  smaller than 640x360 physical pixels (where nothing else fits the arena). */
  scale: number;
  fractional: boolean;
  /** How many art pixels the canvas shows (may exceed 640x360: that surplus is overscan). */
  viewW: number;
  viewH: number;
}

/** `null` for a zero-size (or not yet laid out) container: callers keep their previous layout. */
export function computeSurface(cssW: number, cssH: number, dpr: number): SurfaceLayout | null {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, MAX_DPR) : 1;
  const physW = Math.floor(cssW * ratio);
  const physH = Math.floor(cssH * ratio);
  if (!(physW >= 1 && physH >= 1)) {
    return null;
  }
  // Width binds too, not just height: a 4:3 tablet has less than 16:9 of width per row of height.
  const fit = Math.min(physW / ART_W, physH / ART_H);
  const fractional = fit < 1;
  const scale = fractional ? fit : Math.floor(fit);
  return {
    physW,
    physH,
    scale,
    fractional,
    viewW: physW / scale,
    viewH: physH / scale,
  };
}

export interface StageTransform {
  /** Physical pixels per world unit. */
  scale: number;
  /** Stage position in physical pixels; a whole multiple of `layout.scale`, so the art grid stays
   *  aligned to physical pixels. */
  x: number;
  y: number;
}

/**
 * Centers the arena in the view and applies a shake, both in whole art pixels (a fractional
 * offset shimmers exactly like fractional zoom does). Every arena fits the 640x360 grid, so there
 * is nothing to pan or zoom: ADR 0002 retires the follow camera.
 */
export function placeArena(
  layout: SurfaceLayout,
  bounds: AABB,
  shakeArtPx: { x: number; y: number } = { x: 0, y: 0 },
): StageTransform {
  const artX = Math.round(layout.viewW / 2 - (bounds.x + bounds.w / 2) / WORLD_UNITS_PER_ART_PX);
  const artY = Math.round(layout.viewH / 2 - (bounds.y + bounds.h / 2) / WORLD_UNITS_PER_ART_PX);
  return {
    scale: layout.scale / WORLD_UNITS_PER_ART_PX,
    x: (artX + shakeArtPx.x) * layout.scale,
    y: (artY + shakeArtPx.y) * layout.scale,
  };
}
