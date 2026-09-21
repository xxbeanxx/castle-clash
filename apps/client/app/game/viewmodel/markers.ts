import { renderText } from "./pixelText.js";
import { OUTLINE } from "./arenaRaster.js";
import { createRaster, setPixel, type Raster, type Rgb } from "./raster.js";
import { vivid } from "../render/paletteSwap.js";

/** Plates longer than this are cut: they would be wider than the knight is tall. */
export const MAX_PLATE_CHARS = 10;

export function rgbOf(color: number): Rgb {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/** What a plate says: the name, cut to fit, with a trailing `.` where it was cut. */
export function plateText(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > MAX_PLATE_CHARS ? `${trimmed.slice(0, MAX_PLATE_CHARS - 1)}.` : trimmed;
}

/** A player's name over their head, in their (normalised) colour, with the dark outline. */
export function renderNamePlate(name: string, color: number): Raster {
  return renderText(plateText(name), rgbOf(vivid(color)), OUTLINE);
}

/**
 * A flat ring-ish bar under a knight's feet in the player's colour, so two knights whose art looks
 * alike (or two identical colours) can still be told apart by where they stand, and so the eye finds a
 * knight that is partly behind a hazard. The local player's is longer and has a lit centre.
 */
export function renderGroundMarker(color: number, isLocal: boolean): Raster {
  const w = isLocal ? 21 : 15;
  const target = createRaster(w, 3);
  const base = rgbOf(vivid(color));
  for (let x = 1; x < w - 1; x++) {
    setPixel(target, x, 1, base);
  }
  for (let x = 3; x < w - 3; x++) {
    setPixel(target, x, 0, OUTLINE);
    setPixel(target, x, 2, OUTLINE);
  }
  setPixel(target, 0, 1, OUTLINE);
  setPixel(target, w - 1, 1, OUTLINE);
  if (isLocal) {
    for (let x = 8; x < w - 8; x++) {
      setPixel(target, x, 1, [255, 255, 255]);
    }
  }
  return target;
}

/** A small downward arrow, drawn over the local player's own plate: "this one is you". */
export function renderYouArrow(color: number): Raster {
  const rows = ["OOOOOOO", ".OcccO.", "..OcO..", "...O..."];
  const target = createRaster(7, rows.length);
  const fill = rgbOf(vivid(color));
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "O") {
        setPixel(target, x, y, OUTLINE);
      } else if (ch === "c") {
        setPixel(target, x, y, fill);
      }
    });
  });
  return target;
}
