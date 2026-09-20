/**
 * Player colour by exact palette remap (decision D6 for the Fantasy Knight pack). The pack is
 * 10 fully opaque colours with no anti-aliasing, so a multiply tint (which muddies every pixel,
 * steel included) is unnecessary: only the cloth pixels are replaced and the steel, leather and
 * outline stay exactly as drawn. Pure functions over RGBA bytes; the canvas plumbing is in
 * `KnightAtlas.ts`.
 */

/** The pack's cloth colours (Colour1): the red scarf's two tones and the dark garment under the
 *  armour. These carry the player's colour. */
export const CLOTH_SCARF = 0x833c22;
export const CLOTH_SCARF_SHADE = 0x481a13;
export const CLOTH_GARMENT = 0x3a3836;

/** The brightest channel a player colour is normalised to, so a near-black or near-white
 *  `colorSeed` still reads as a colour against the dark garment. */
const VIVID_MAX = 220;

function scale(rgb: number, k: number): number {
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((rgb >> shift) & 0xff) * k)));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Scales `rgb` so its brightest channel is `VIVID_MAX` (pure black becomes a mid grey). */
export function vivid(rgb: number): number {
  const max = Math.max((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
  if (max === 0) {
    return 0x808080;
  }
  return scale(rgb, VIVID_MAX / max);
}

/** Source colour -> replacement colour, both `0xRRGGBB`, for a player of colour `rgb`. */
export function playerSwap(rgb: number): ReadonlyMap<number, number> {
  const base = vivid(rgb);
  return new Map([
    [CLOTH_SCARF, base],
    [CLOTH_SCARF_SHADE, scale(base, 0.5)],
    [CLOTH_GARMENT, scale(base, 0.42)],
  ]);
}

/** Rewrites opaque pixels of `data` (RGBA bytes) whose colour is a key of `swap`, in place. */
export function applyPaletteSwap(data: Uint8ClampedArray, swap: ReadonlyMap<number, number>): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      continue;
    }
    const to = swap.get(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    if (to !== undefined) {
      data[i] = (to >> 16) & 0xff;
      data[i + 1] = (to >> 8) & 0xff;
      data[i + 2] = to & 0xff;
    }
  }
}
