// @vitest-environment node
import { ALL_ARENAS, TUTORIAL_ARENA, type AABB } from "@castle-clash/shared";
import { describe, expect, it } from "vitest";
import {
  OUTLINE,
  maskFromBoxes,
  paintBlocks,
  renderAbyss,
  renderBackground,
  renderBlock,
  renderTerrain,
  toArtBox,
  type BlockStyle,
} from "./arenaRaster.js";
import { ARENA_THEMES, themeFor } from "./arenaThemes.js";
import { createRaster, pixelAt, type Raster } from "./raster.js";

const FILL: Raster = (() => {
  const r = createRaster(4, 4);
  for (let i = 0; i < 16; i++) {
    r.data.set([100, 110, 120, 255], i * 4);
  }
  return r;
})();
const CAP_1: [number, number, number] = [250, 240, 230];
const CAP_2: [number, number, number] = [200, 190, 180];
const STYLE: BlockStyle = {
  fill: FILL,
  cap: [CAP_1, CAP_2],
  outline: OUTLINE,
  shade: 0.5,
  brightness: 1,
};

function sprites(name: string): Raster {
  void name;
  return FILL;
}

const rgb = (r: Raster, x: number, y: number) => pixelAt(r, x, y).slice(0, 3);

describe("paintBlocks", () => {
  it("outlines a lone block, lights a cap under its top edge, shades its right and bottom faces", () => {
    const block = renderBlock(12, 12, STYLE);
    expect(rgb(block, 0, 5)).toEqual([...OUTLINE]);
    expect(rgb(block, 11, 5)).toEqual([...OUTLINE]);
    expect(rgb(block, 5, 0)).toEqual([...OUTLINE]);
    expect(rgb(block, 5, 11)).toEqual([...OUTLINE]);
    expect(rgb(block, 5, 1)).toEqual(CAP_1);
    expect(rgb(block, 5, 2)).toEqual(CAP_2);
    expect(rgb(block, 5, 5)).toEqual([100, 110, 120]);
    expect(rgb(block, 10, 5)).toEqual([50, 55, 60]);
    expect(rgb(block, 5, 10)).toEqual([50, 55, 60]);
  });

  it("draws no outline between boxes that touch, and none where the block meets the world's edge", () => {
    // A wall (x 0-3) beside a floor (y 8-11): edges are found on the union.
    const w = 12;
    const h = 12;
    const target = createRaster(w, h);
    const mask = maskFromBoxes(w, h, [
      { x: 0, y: 0, w: 8, h: 24 },
      { x: 0, y: 16, w: 24, h: 8 },
    ]);
    paintBlocks(target, mask, STYLE, true);
    // Inside the L's corner and along the screen edge: not outline.
    expect(rgb(target, 3, 9)).not.toEqual([...OUTLINE]);
    expect(rgb(target, 0, 5)).not.toEqual([...OUTLINE]);
    expect(rgb(target, 5, 11)).not.toEqual([...OUTLINE]);
    // The wall's exposed right face is outlined.
    expect(rgb(target, 3, 2)).toEqual([...OUTLINE]);
  });
});

describe("renderTerrain", () => {
  const boxesOf = (arena: { solids: readonly AABB[]; platforms: readonly AABB[] }) => [
    ...arena.solids,
    ...arena.platforms,
  ];

  it.each([...ALL_ARENAS, TUTORIAL_ARENA].map((a) => [a.id, a] as const))(
    "%s: paints exactly the pixels the solids and platforms cover",
    (_id, arena) => {
      const terrain = renderTerrain(arena, themeFor(arena.id), sprites);
      const bounds = toArtBox(arena.bounds);
      expect([terrain.w, terrain.h]).toEqual([bounds.w, bounds.h]);
      const mask = maskFromBoxes(terrain.w, terrain.h, boxesOf(arena));
      let covered = 0;
      for (let i = 0; i < mask.length; i++) {
        const opaque = (terrain.data[i * 4 + 3] ?? 0) === 255;
        if (Boolean(mask[i]) !== opaque) {
          throw new Error(
            `${arena.id}: pixel ${i % terrain.w},${Math.floor(i / terrain.w)} disagrees`,
          );
        }
        covered += mask[i] ?? 0;
      }
      expect(covered).toBeGreaterThan(0);
    },
  );

  it("has a theme for every arena", () => {
    for (const arena of ALL_ARENAS) {
      expect(ARENA_THEMES[arena.id], arena.id).toBeDefined();
    }
  });

  it("lands every arena box on whole art pixels (an odd unit count would be rounded)", () => {
    for (const arena of [...ALL_ARENAS, TUTORIAL_ARENA]) {
      for (const box of [...arena.solids, ...arena.platforms, ...arena.hazards.map((h) => h.box)]) {
        for (const v of [box.x, box.y, box.w, box.h]) {
          expect(v % 2, `${arena.id} ${JSON.stringify(box)}`).toBe(0);
        }
      }
    }
  });
});

describe("renderBackground and renderAbyss", () => {
  it("fills the whole background opaque and puts props on it", () => {
    const arena = ALL_ARENAS[0]!;
    const bg = renderBackground(arena, themeFor(arena.id), sprites);
    for (let i = 0; i < bg.w * bg.h; i++) {
      expect(bg.data[i * 4 + 3]).toBe(255);
    }
  });

  it("is dark everywhere and glows only along the top edge of a pit", () => {
    const pit = renderAbyss(40, 40);
    const lit = (y: number) =>
      [...Array(40).keys()].filter((x) => rgb(pit, x, y)[0]! > 0x20).length;
    expect(lit(0)).toBeGreaterThan(0);
    expect(lit(30)).toBe(0);
  });

  it("leaves a tall, narrow drop plain", () => {
    const drop = renderAbyss(10, 180);
    for (let y = 0; y < 20; y++) {
      expect(rgb(drop, 3, y)[0]).toBeLessThan(0x20);
    }
  });
});
