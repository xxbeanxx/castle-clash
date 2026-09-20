// @vitest-environment node
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allClips, clipLength } from "../viewmodel/knightAnimation.js";
import type { KnightAtlasData } from "./KnightAtlas.js";

const DIR = new URL("../../../public/assets/knight/", import.meta.url);
const atlas = JSON.parse(readFileSync(new URL("knight.json", DIR), "utf8")) as KnightAtlasData;
const PNG_BYTES = statSync(new URL("knight.png", DIR)).size;

// The start of `assets:check` (plan 15.1 step 5): the committed atlas and the animation contract
// in `viewmodel/knightAnimation.ts` must agree, or a clip would render as nothing.
describe("knight atlas", () => {
  it("has exactly the clips knightAnimation.ts names, each with its frame count", () => {
    expect(Object.keys(atlas.animations).sort()).toEqual([...allClips()].sort());
    for (const clip of allClips()) {
      expect(atlas.animations[clip], clip).toHaveLength(clipLength(clip));
    }
  });

  it("only names frames that exist, all inside the image and the declared frame size", () => {
    const { size, frameSize } = atlas.meta as unknown as {
      size: { w: number; h: number };
      frameSize: { w: number; h: number };
    };
    for (const names of Object.values(atlas.animations)) {
      for (const name of names) {
        const f = atlas.frames[name]?.frame;
        expect(f, name).toBeDefined();
        expect(f?.w).toBe(frameSize.w);
        expect(f?.h).toBe(frameSize.h);
        expect((f?.x ?? 0) + (f?.w ?? 0)).toBeLessThanOrEqual(size.w);
        expect((f?.y ?? 0) + (f?.h ?? 0)).toBeLessThanOrEqual(size.h);
      }
    }
  });

  it("puts the pivot on the feet row and inside the frame", () => {
    const { pivot, frameSize } = atlas.meta;
    expect(pivot.y).toBe(frameSize.h);
    expect(pivot.x).toBeGreaterThan(0);
    expect(pivot.x).toBeLessThan(frameSize.w);
  });

  it("stays inside the knight bundle budget (bible: 3 MB initial load, all art)", () => {
    expect(PNG_BYTES).toBeLessThan(200 * 1024);
  });
});
