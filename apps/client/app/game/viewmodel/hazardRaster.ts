import type { ArenaTheme, SpriteSource } from "./arenaThemes.js";
import { OUTLINE, UNITS_PER_ART_PX, blockStyle, renderAbyss, renderBlock } from "./arenaRaster.js";
import type { HazardRect } from "./hazardsToRects.js";
import { blit, createRaster, setPixel, type Raster, type Rgb } from "./raster.js";

/** How long a fallen collapsing platform keeps dropping before it is gone (ms). */
export const FALL_MS = 500;
/** Milliseconds per flame frame (about 9 fps: quick enough to read as fire, slow enough to stay crisp). */
const FLAME_FRAME_MS = 110;
const FLAME_FRAMES = 4;
const FLAME_H = 24;
/** Downward acceleration of a falling platform, world units per second squared. */
const FALL_GRAVITY = 1800;

/** What to draw for a hazard this frame: which prebuilt image (`key`, see `paintHazard`), and how to
 *  place and fade it. Pure, so the state-to-look table is unit-testable without Pixi. */
export interface HazardVisual {
  key: string;
  /** World-unit offsets from the hazard's box. */
  dx: number;
  dy: number;
  alpha: number;
  visible: boolean;
}

const HIDDEN: HazardVisual = { key: "", dx: 0, dy: 0, alpha: 0, visible: false };

/** Whether a timed trap's box is a vertical gate (a portcullis) rather than a floor plate. */
export function isGate(rect: Pick<HazardRect, "w" | "h">): boolean {
  return rect.h > rect.w;
}

/**
 * `sincePhaseMs` is how long the hazard has been in its current `phase` (the view tracks that; the
 * wire only carries the phase). It drives the fall of a collapsed platform and the warn flicker.
 */
export function hazardVisual(rect: HazardRect, nowMs: number, sincePhaseMs: number): HazardVisual {
  const shown = (key: string, extra: Partial<HazardVisual> = {}): HazardVisual => ({
    key,
    dx: 0,
    dy: 0,
    alpha: 1,
    visible: true,
    ...extra,
  });
  switch (rect.kind) {
    case "fireZone":
      return rect.phase === "off"
        ? shown("embers")
        : shown(`flame-${Math.floor(nowMs / FLAME_FRAME_MS) % FLAME_FRAMES}`);
    case "timedTrap": {
      const prefix = isGate(rect) ? "gate" : "spikes";
      const phase = rect.phase === "warn" || rect.phase === "active" ? rect.phase : "idle";
      // The telegraph blinks so it cannot be mistaken for the resting state.
      const blink = phase === "warn" && Math.floor(nowMs / 90) % 2 === 0 ? 0.55 : 1;
      return shown(`${prefix}-${phase}`, { alpha: blink });
    }
    case "breakableFloor": {
      if (!rect.active) {
        return HIDDEN;
      }
      const max = Math.max(1, rect.maxHp);
      const stage = rect.hp >= max ? 0 : rect.hp > max / 2 ? 1 : 2;
      return shown(`block-${stage}`);
    }
    case "collapsingPlatform": {
      if (rect.phase === "fallen" || !rect.active) {
        const t = sincePhaseMs / 1000;
        return sincePhaseMs >= FALL_MS
          ? HIDDEN
          : shown("block-0", { dy: 0.5 * FALL_GRAVITY * t * t, alpha: 1 - sincePhaseMs / FALL_MS });
      }
      // Shaking: a 1 art px jitter, alternating every 50 ms.
      const jitter =
        rect.phase === "shaking" ? (Math.floor(nowMs / 50) % 2 ? 1 : -1) * UNITS_PER_ART_PX : 0;
      return shown("block-0", { dx: jitter });
    }
    case "killZone":
      return shown("abyss");
    default:
      return HIDDEN;
  }
}

function tileAcross(target: Raster, sprite: Raster, y: number, dim = 1): void {
  const offset = Math.floor((target.w % sprite.w) / 2);
  for (let x = -offset; x < target.w; x += sprite.w) {
    blit(target, sprite, x, y, dim);
  }
}

const IRON: Rgb = [0x8b, 0x9b, 0xb4];
const IRON_LIT: Rgb = [0xc0, 0xcb, 0xdc];
const WARN_RED: Rgb = [0xe8, 0x45, 0x37];
const SPARK_HOT: Rgb = [0xf7, 0xc2, 0x82];
const SPARK_WARM: Rgb = [0xe8, 0x45, 0x37];

/** A vertical iron gate hanging from the top of its box: `extent` px of bars below a housing row. */
function paintGate(w: number, h: number, extent: number, tip: Rgb): Raster {
  const target = createRaster(w, h);
  const housing = 4;
  for (let y = 0; y < housing; y++) {
    for (let x = 0; x < w; x++) {
      setPixel(target, x, y, y === housing - 1 || x === 0 || x === w - 1 ? OUTLINE : IRON);
    }
  }
  const barW = 4;
  const pitch = 6;
  const bars = Math.max(1, Math.floor((w - barW) / pitch) + 1);
  const start = Math.floor((w - ((bars - 1) * pitch + barW)) / 2);
  for (let b = 0; b < bars; b++) {
    const x0 = start + b * pitch;
    const bottom = Math.min(h, housing + extent);
    for (let y = housing; y < bottom; y++) {
      const pointed = y >= bottom - 3;
      setPixel(target, x0, y, OUTLINE);
      setPixel(target, x0 + barW - 1, y, OUTLINE);
      setPixel(target, x0 + 1, y, pointed ? tip : IRON_LIT);
      setPixel(target, x0 + 2, y, pointed ? tip : IRON);
    }
    if (bottom > housing) {
      setPixel(target, x0 + 1, bottom - 1, OUTLINE);
      setPixel(target, x0 + 2, bottom - 1, OUTLINE);
    }
  }
  return target;
}

/** Builds the image for one `HazardVisual.key`. `w`/`h` are the hazard's box in art pixels. */
export function paintHazard(
  key: string,
  w: number,
  h: number,
  theme: ArenaTheme,
  sprite: SpriteSource,
): Raster {
  const [family = "", variant = ""] = key.split("-");
  switch (family) {
    case "flame": {
      const target = createRaster(w, h);
      const frame = Number(variant);
      tileAcross(target, sprite(`hazard/flame-${frame}`), h - FLAME_H);
      // A zone taller than one flame is filled by sparks drifting up out of it, so its whole box reads
      // as fire without a second row of flames stacked into a wall.
      const rise = h - FLAME_H;
      for (let i = 0; rise > 0 && i < Math.ceil(w / 5); i++) {
        const x = (i * 37 + 5) % w;
        const y = h - FLAME_H - 1 - ((i * 53 + frame * 4) % rise);
        setPixel(target, x, y, i % 2 ? SPARK_HOT : SPARK_WARM);
      }
      return target;
    }
    case "embers": {
      const target = createRaster(w, h);
      for (let x = 0; x < w; x++) {
        setPixel(target, x, h - 1, x % 3 ? [0x76, 0x3b, 0x36] : [0xbd, 0x6c, 0x4a]);
        if (x % 5 === 2) {
          setPixel(target, x, h - 2, [0xcf, 0x82, 0x54]);
        }
      }
      return target;
    }
    case "spikes": {
      const target = createRaster(w, h);
      tileAcross(target, sprite(`hazard/spikes-${variant}`), h - 16);
      return target;
    }
    case "gate":
      return variant === "active"
        ? paintGate(w, h, h, IRON_LIT)
        : variant === "warn"
          ? paintGate(w, h, Math.round(h * 0.45), WARN_RED)
          : paintGate(w, h, 6, IRON);
    case "block": {
      const target = renderBlock(w, h, blockStyle(theme.hazardBlock, sprite));
      const stage = Number(variant);
      if (stage > 0) {
        tileAcross(target, sprite(`hazard/crack-${stage}`), Math.floor((h - 16) / 2));
      }
      return target;
    }
    case "abyss":
      return renderAbyss(w, h);
    default:
      throw new Error(`unknown hazard image ${key}`);
  }
}
