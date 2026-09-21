// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `assets:check` (plan 15.1 step 5), run by `pnpm --filter @castle-clash/client run assets:check` and, like
 * every test, by CI. It guards what the atlas-specific tests cannot: that no art reaches the repository
 * unlogged, that the bundles stay inside their budgets, and that each atlas is internally consistent.
 * The clip and frame names the code uses are checked against the atlases by `knightAtlas.test.ts` and
 * `hazardRaster.test.ts`.
 */
const CLIENT = new URL("../", import.meta.url).pathname;
const ASSETS = join(CLIENT, "public/assets");
const REPO = join(CLIENT, "../..");
const LICENSES = readFileSync(join(REPO, "art/LICENSES.md"), "utf8");

/** Docs/art/BIBLE.md, "Budgets": initial load 3 MB or less, each bundle well inside it. */
const TOTAL_BUDGET = 3 * 1024 * 1024;
const BUNDLE_BUDGET = 200 * 1024;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(ASSETS);
const bundles = [...new Set(files.map((f) => relative(ASSETS, f).split("/")[0]!))];

describe("assets:check", () => {
  it("finds the bundles this check is about", () => {
    expect(bundles).toEqual(expect.arrayContaining(["knight", "world"]));
  });

  it("only ships png and json", () => {
    for (const file of files) {
      expect(file, file).toMatch(/\.(png|json)$/);
    }
  });

  it("logs every asset in art/LICENSES.md (its folder and its file name)", () => {
    for (const file of files) {
      const rel = relative(ASSETS, file);
      const folder = `public/assets/${rel.split("/").slice(0, -1).join("/")}/`;
      const name = rel.split("/").pop()!;
      expect(LICENSES, `${folder} is not in art/LICENSES.md`).toContain(folder);
      expect(LICENSES, `${name} is not in art/LICENSES.md`).toContain(name);
    }
  });

  it("keeps each bundle and the whole set inside the byte budgets", () => {
    for (const bundle of bundles) {
      const bytes = walk(join(ASSETS, bundle)).reduce((sum, f) => sum + statSync(f).size, 0);
      expect(bytes, `${bundle} is ${bytes} bytes`).toBeLessThan(BUNDLE_BUDGET);
    }
    const total = files.reduce((sum, f) => sum + statSync(f).size, 0);
    expect(total).toBeLessThan(TOTAL_BUDGET);
  });

  it("has real PNGs", () => {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const file of files.filter((f) => f.endsWith(".png"))) {
      const head = [...readFileSync(file).subarray(0, 8)];
      expect(head, file).toEqual(signature);
    }
  });

  it("has atlases whose image exists and whose frames lie inside it", () => {
    const atlases = files.filter((f) => f.endsWith(".json"));
    expect(atlases.length).toBeGreaterThan(0);
    for (const file of atlases) {
      const data = JSON.parse(readFileSync(file, "utf8")) as {
        frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
        meta: { image: string; size: { w: number; h: number } };
      };
      const image = join(file, "..", data.meta.image);
      expect(statSync(image).isFile(), `${file} names a missing image`).toBe(true);
      for (const [name, { frame }] of Object.entries(data.frames)) {
        expect(frame.x + frame.w, `${file}:${name}`).toBeLessThanOrEqual(data.meta.size.w);
        expect(frame.y + frame.h, `${file}:${name}`).toBeLessThanOrEqual(data.meta.size.h);
      }
    }
  });

  it("has an atlas whose declared size is the PNG's real size", () => {
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const data = JSON.parse(readFileSync(file, "utf8")) as {
        meta: { image: string; size: { w: number; h: number } };
      };
      const png = readFileSync(join(file, "..", data.meta.image));
      // The IHDR chunk holds width and height as big-endian u32 at byte 16 and 20.
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], file).toEqual([
        data.meta.size.w,
        data.meta.size.h,
      ]);
    }
  });
});
